import base64
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

import jwt
from pydantic import ValidationError
from sqlalchemy import delete

from app.core.config import Settings
from app.identity.config import LOGIN_TRANSACTION_LIFETIME_SECONDS
from app.infrastructure.database.session import SessionLocal
from app.identity.models.login_transaction import LoginTransaction
from app.identity.schemas.oidc import Discovery, Identity, LoginStart, TokenResponse


class LoginRejected(Exception):
    pass


class ProviderUnavailable(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Request,
        fp: object,
        code: int,
        msg: str,
        headers: object,
        newurl: str,
    ) -> None:
        return None


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("ascii")).hexdigest()


def fetch(url: str, form: dict[str, str] | None = None) -> bytes:
    data = urlencode(form).encode("ascii") if form is not None else None
    request = Request(url, data=data, headers={"Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            body = response.read(1_048_577)
            if len(body) > 1_048_576:
                raise ProviderUnavailable()
            return body
    except HTTPError as error:
        if form is not None and error.code == 400:
            try:
                payload: object = json.loads(error.read(4096))
            except (ValueError, OSError):
                raise ProviderUnavailable() from None
            if isinstance(payload, dict) and payload.get("error") == "invalid_grant":
                raise LoginRejected() from None
        raise ProviderUnavailable() from None
    except (URLError, TimeoutError, OSError):
        raise ProviderUnavailable() from None


class OIDCLogin:
    def __init__(self, settings: Settings) -> None:
        assert (
            settings.oidc_issuer
            and settings.oidc_client_secret
            and settings.oidc_callback_url
        )
        self.issuer = settings.oidc_issuer
        self.client_id = settings.oidc_client_id
        self.secret = settings.oidc_client_secret.get_secret_value()
        self.callback_url = settings.oidc_callback_url
        self.backchannel = settings.oidc_backchannel_url or self.issuer
        self.secure_cookie = self.callback_url.startswith("https://")

    def transport_url(self, url: str) -> str:
        if not url.startswith(self.issuer + "/"):
            raise ProviderUnavailable()
        return self.backchannel + url[len(self.issuer) :]

    def discovery(self) -> Discovery:
        try:
            metadata = Discovery.model_validate_json(
                fetch(self.backchannel + "/.well-known/openid-configuration")
            )
        except ValidationError:
            raise ProviderUnavailable() from None
        if metadata.issuer != self.issuer:
            raise ProviderUnavailable()
        for url in (
            metadata.authorization_endpoint,
            metadata.token_endpoint,
            metadata.jwks_uri,
        ):
            self.transport_url(url)
        return metadata

    def start(self) -> LoginStart:
        metadata = self.discovery()
        state, binding = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
        now = datetime.now(timezone.utc)
        with SessionLocal.begin() as session:
            session.execute(
                delete(LoginTransaction).where(LoginTransaction.expires_at <= now)
            )
            session.add(
                LoginTransaction(
                    state_hash=digest(state),
                    browser_hash=digest(binding),
                    nonce=nonce,
                    verifier=verifier,
                    expires_at=now + timedelta(seconds=LOGIN_TRANSACTION_LIFETIME_SECONDS),
                )
            )
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
            .rstrip(b"=")
            .decode("ascii")
        )
        parameters = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.callback_url,
            "scope": "openid",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return LoginStart(
            metadata.authorization_endpoint + "?" + urlencode(parameters), binding
        )

    def consume(self, state: str, binding: str) -> LoginTransaction:
        try:
            state_hash, browser_hash = digest(state), digest(binding)
        except UnicodeError:
            raise LoginRejected() from None
        with SessionLocal.begin() as session:
            transaction = session.scalars(
                delete(LoginTransaction)
                .where(
                    LoginTransaction.state_hash == state_hash,
                    LoginTransaction.browser_hash == browser_hash,
                    LoginTransaction.expires_at > datetime.now(timezone.utc),
                )
                .returning(LoginTransaction)
            ).one_or_none()
        if transaction is None:
            raise LoginRejected()
        return transaction

    def finish(self, transaction: LoginTransaction, code: str) -> Identity:
        metadata = self.discovery()
        try:
            token = TokenResponse.model_validate_json(
                fetch(
                    self.transport_url(metadata.token_endpoint),
                    {
                        "grant_type": "authorization_code",
                        "code": code,
                        "client_id": self.client_id,
                        "client_secret": self.secret,
                        "redirect_uri": self.callback_url,
                        "code_verifier": transaction.verifier,
                    },
                )
            )
        except ValidationError:
            raise ProviderUnavailable() from None
        try:
            keys = jwt.PyJWKSet.from_json(
                fetch(self.transport_url(metadata.jwks_uri)).decode("utf-8")
            )
        except (ValueError, jwt.PyJWTError):
            raise ProviderUnavailable() from None
        try:
            header = jwt.get_unverified_header(token.id_token)
            matching = [
                key
                for key in keys.keys
                if key.key_id == header.get("kid")
                and key.public_key_use in (None, "sig")
                and key.algorithm_name == "RS256"
            ]
            if len(matching) != 1:
                raise LoginRejected()
            claims = jwt.decode(
                token.id_token,
                matching[0].key,
                algorithms=["RS256"],
                issuer=self.issuer,
                audience=self.client_id,
                options={"require": ["iss", "sub", "aud", "exp", "iat", "nonce"]},
            )
            identity = Identity.model_validate(claims)
            if not secrets.compare_digest(
                identity.nonce.encode("utf-8"), transaction.nonce.encode("utf-8")
            ):
                raise LoginRejected()
            if "azp" in claims and claims["azp"] != self.client_id:
                raise LoginRejected()
            if (
                isinstance(claims["aud"], list)
                and len(claims["aud"]) > 1
                and claims.get("azp") != self.client_id
            ):
                raise LoginRejected()
            return identity
        except (jwt.PyJWTError, ValidationError, UnicodeError):
            raise LoginRejected() from None
