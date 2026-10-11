"""Verify the local gateway/backend/Keycloak round trip with a disposable account."""

import argparse
import secrets
from dataclasses import dataclass
from html.parser import HTMLParser
from http.cookiejar import CookieJar, DefaultCookiePolicy
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import HTTPCookieProcessor, HTTPRedirectHandler, Request, build_opener


class Page(HTMLParser):
    def __init__(self, body: str) -> None:
        super().__init__()
        self.action = ""
        self.inputs: dict[str, str] = {}
        self.registration = ""
        self.feed(body)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "form":
            self.action = values.get("action") or ""
        if tag == "input" and values.get("name"):
            self.inputs[values["name"] or ""] = values.get("value") or ""
        if tag == "a" and "registration" in (values.get("href") or ""):
            self.registration = values["href"] or ""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self, req: Request, fp: object, code: int, msg: str,
        headers: object, newurl: str,
    ) -> None:
        return None


@dataclass(frozen=True)
class Response:
    status: int
    body: str
    location: str


class Browser:
    def __init__(self, base_url: str, provider_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.origins = {urlsplit(base_url).netloc, urlsplit(provider_url).netloc}
        for url in (base_url, provider_url):
            parsed = urlsplit(url)
            if parsed.scheme != "http" or parsed.hostname != "localhost" or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise RuntimeError("Verification requires plain HTTP localhost URLs.")
        # Keycloak's local login uses Secure cookies even on HTTP localhost.
        policy = DefaultCookiePolicy(secure_protocols=("https", "wss", "http"))
        self.cookies = CookieJar(policy)
        self.opener = build_opener(HTTPCookieProcessor(self.cookies), NoRedirect())

    def request(self, url: str, fields: dict[str, str] | None = None) -> Response:
        if urlsplit(url).netloc not in self.origins or urlsplit(url).scheme != "http":
            raise RuntimeError("Unexpected redirect destination.")
        data = urlencode(fields).encode() if fields is not None else None
        try:
            with self.opener.open(Request(url, data=data), timeout=30) as response:
                return Response(response.status, response.read().decode(), response.headers.get("Location", ""))
        except HTTPError as error:
            return Response(error.code, error.read().decode(), error.headers.get("Location", ""))
        except (URLError, OSError):
            raise RuntimeError("A local verification service is unavailable.") from None

    def follow(self, url: str, fields: dict[str, str] | None = None) -> Response:
        for _ in range(10):
            response = self.request(url, fields)
            if response.status not in (302, 303) or not response.location:
                return response
            url = urljoin(url, response.location)
            fields = None
        raise RuntimeError("Too many redirects.")

    def login_page(self) -> Page:
        response = self.follow(self.base_url + "/api/auth/login")
        page = Page(response.body)
        if response.status != 200 or not page.action:
            raise RuntimeError("The hosted login form was not returned.")
        return page


def verify(base_url: str, provider_url: str, allow_user_creation: bool) -> None:
    if not allow_user_creation:
        raise RuntimeError("Pass --allow-user-creation to acknowledge that one demo account will remain.")
    run = secrets.token_hex(6)
    email, password = f"kochwiki-login-{run}@example.invalid", f"kitchen family verification {run}"
    browser = Browser(base_url, provider_url)
    page = browser.login_page()
    if not page.registration:
        raise RuntimeError("Registration link is missing.")
    registration = Page(browser.follow(urljoin(provider_url, page.registration)).body)
    display_field = next((name for name in registration.inputs if name.endswith("displayName")), "")
    if not registration.action or not display_field:
        raise RuntimeError("Registration form is incomplete.")
    registered = browser.follow(registration.action, registration.inputs | {
        "email": email, "password": password, "password-confirm": password,
        display_field: "KochWiki Verification",
    })
    if registered.status != 200 or "Identity successfully verified." not in registered.body:
        raise RuntimeError("Registration did not complete backend verification.")
    if any(cookie.name == "kochwiki_login" for cookie in browser.cookies):
        raise RuntimeError("The temporary login cookie was not cleared.")
    print("PASS: registration through the gateway and validated backend callback")

    fresh_browser = Browser(base_url, provider_url)
    login = fresh_browser.login_page()
    signed_in = fresh_browser.follow(login.action, login.inputs | {"username": email, "password": password})
    if signed_in.status != 200 or "Identity successfully verified." not in signed_in.body:
        raise RuntimeError("Existing-account login failed backend verification.")
    print("PASS: existing-account email/password login through a fresh browser")
    reused = browser.follow(base_url + "/api/auth/login")
    if reused.status != 200 or "Identity successfully verified." not in reused.body:
        raise RuntimeError("An existing provider session failed verification.")
    print("PASS: an existing Keycloak browser session completes a new login transaction")
    if browser.request(base_url + "/api/auth/callback?state=unknown&code=unknown").status != 400:
        raise RuntimeError("An unbound callback was accepted.")
    print("PASS: unbound callback rejected; no application login session issued")
    print(f"Demo account retained: {email}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--provider-url", default="http://localhost:8006")
    parser.add_argument("--allow-user-creation", action="store_true")
    arguments = parser.parse_args()
    try:
        verify(arguments.base_url, arguments.provider_url, arguments.allow_user_creation)
    except RuntimeError as error:
        parser.exit(1, f"Verification failed: {error}\n")
