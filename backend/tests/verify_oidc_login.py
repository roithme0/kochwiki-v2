"""Verify the disposable gateway/backend/Keycloak round trip."""

import argparse
import json
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

    def request(self, url: str, fields: dict[str, str] | None = None, method: str | None = None, headers: dict[str, str] | None = None) -> Response:
        if urlsplit(url).netloc not in self.origins or urlsplit(url).scheme != "http":
            raise RuntimeError("Unexpected redirect destination.")
        data = urlencode(fields).encode() if fields is not None else None
        try:
            with self.opener.open(Request(url, data=data, method=method, headers=headers or {}), timeout=30) as response:
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

    def users(self) -> list[tuple[int, str]]:
        response = self.request(self.base_url + "/api/users")
        if response.status != 200:
            raise RuntimeError("The local users could not be inspected.")
        payload: object = json.loads(response.body)
        if not isinstance(payload, list):
            raise RuntimeError("Unexpected user-list contract.")
        users: list[tuple[int, str]] = []
        for value in payload:
            if not isinstance(value, dict) or set(value) != {"id", "display_name"}:
                raise RuntimeError("The user contract exposes unexpected fields.")
            if not isinstance(value["id"], int) or not isinstance(value["display_name"], str):
                raise RuntimeError("Invalid user-list fields.")
            users.append((value["id"], value["display_name"]))
        return users


def verify(base_url: str, provider_url: str, allow_user_creation: bool) -> None:
    if base_url.rstrip("/") != "http://localhost:8012" or provider_url.rstrip("/") != "http://localhost:8016":
        raise RuntimeError("Verification requires the disposable backend/provider on ports 8012/8016.")
    if not allow_user_creation:
        raise RuntimeError("Pass --allow-user-creation to create an account in the disposable provider.")
    run = secrets.token_hex(6)
    email, password = f"kochwiki-login-{run}@example.invalid", f"kitchen family verification {run}"
    browser = Browser(base_url, provider_url)
    if browser.users():
        raise RuntimeError("Verification requires an empty disposable KochWiki database.")
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
    users = browser.users()
    if len(users) != 1 or users[0][1] != "KochWiki Verification":
        raise RuntimeError("First login did not create the expected local profile.")
    if email in registered.body or "KochWiki Verification" in registered.body:
        raise RuntimeError("The callback exposed profile information.")
    print("PASS: first login creates a local user without exposing its provider identity")
    if browser.request(base_url + "/api/users", {"display_name": "Manual user"}).status != 405:
        raise RuntimeError("Manual user creation is still exposed.")
    print("PASS: manual user creation is unavailable")
    if browser.request(base_url + f"/api/users/{users[0][0]}", {"display_name": "Local edit"}, method="PATCH").status != 405:
        raise RuntimeError("Local provider-profile editing is still exposed.")
    print("PASS: local profile editing is unavailable")

    fresh_browser = Browser(base_url, provider_url)
    login = fresh_browser.login_page()
    signed_in = fresh_browser.follow(login.action, login.inputs | {"username": email, "password": password})
    if signed_in.status != 200 or "Identity successfully verified." not in signed_in.body:
        raise RuntimeError("Existing-account login failed backend verification.")
    print("PASS: existing-account email/password login through a fresh browser")
    if fresh_browser.users() != users:
        raise RuntimeError("Repeat login changed the local user mapping.")
    reused = browser.follow(base_url + "/api/auth/login")
    if reused.status != 200 or "Identity successfully verified." not in reused.body:
        raise RuntimeError("An existing provider session failed verification.")
    print("PASS: an existing Keycloak browser session completes a new login transaction")
    if browser.users() != users:
        raise RuntimeError("Provider-session login changed the local user mapping.")
    duplicate_browser = Browser(base_url, provider_url)
    duplicate_page = duplicate_browser.login_page()
    duplicate_registration = Page(duplicate_browser.follow(urljoin(provider_url, duplicate_page.registration)).body)
    duplicate = duplicate_browser.follow(duplicate_registration.action, duplicate_registration.inputs | {
        "email": f"kochwiki-second-{run}@example.invalid", "password": password,
        "password-confirm": password, display_field: "KochWiki Verification",
    })
    duplicate_users = duplicate_browser.users()
    if duplicate.status != 200 or "Identity successfully verified." not in duplicate.body or len(duplicate_users) != 2 or duplicate_users[0][0] == duplicate_users[1][0]:
        raise RuntimeError("A separate provider account did not receive a separate local identity.")
    if any(name != "KochWiki Verification" for _, name in duplicate_users):
        raise RuntimeError("Duplicate display names were not preserved.")
    print("PASS: separate provider accounts can share a display name")
    if browser.request(base_url + "/api/auth/callback?state=unknown&code=unknown").status != 400:
        raise RuntimeError("An unbound callback was accepted.")
    current = browser.request(base_url + "/api/auth/me")
    if current.status != 200 or json.loads(current.body) != {"id": users[0][0], "display_name": users[0][1]}:
        raise RuntimeError("Authenticated-user lookup failed or an invalid callback lost the existing session.")
    session_cookie = next((cookie for cookie in browser.cookies if cookie.name == "kochwiki_session"), None)
    if session_cookie is None or session_cookie.path != "/api" or session_cookie.expires is None:
        raise RuntimeError("The callback did not establish a persistent application session.")
    if browser.request(base_url + "/api/auth/logout", method="POST").status != 403:
        raise RuntimeError("Logout accepted a request without its CSRF Origin check.")
    if browser.request(base_url + "/api/auth/logout", method="POST", headers={"Origin": base_url}).status != 204:
        raise RuntimeError("Local logout failed.")
    if browser.request(base_url + "/api/auth/me").status != 401:
        raise RuntimeError("The application session survived logout.")
    if any(cookie.name == "kochwiki_session" for cookie in browser.cookies):
        raise RuntimeError("The application session cookie survived logout.")
    if fresh_browser.request(base_url + "/api/auth/me").status != 200:
        raise RuntimeError("Logout unexpectedly invalidated another browser's session.")
    relogin = browser.follow(base_url + "/api/auth/login")
    if relogin.status != 200 or browser.request(base_url + "/api/auth/me").status != 200:
        raise RuntimeError("Local logout unexpectedly ended the Keycloak browser session.")
    print("PASS: persistent local session, private current-user contract, CSRF logout and preserved Keycloak session")
    print("PASS: temporary account created in the disposable provider; runner handles teardown")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8012")
    parser.add_argument("--provider-url", default="http://localhost:8016")
    parser.add_argument("--allow-user-creation", action="store_true")
    arguments = parser.parse_args()
    try:
        verify(arguments.base_url, arguments.provider_url, arguments.allow_user_creation)
    except RuntimeError as error:
        parser.exit(1, f"Verification failed: {error}\n")
