from urllib.parse import SplitResult, urlsplit


def validate_http_url(value: str) -> SplitResult:
    if any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("HTTP(S) URLs must not contain whitespace or control characters")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise ValueError("Invalid HTTP(S) URL") from None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("HTTP(S) URLs require an HTTP(S) scheme and hostname")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("HTTP(S) URLs must not contain credentials")
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("HTTP(S) URLs require a port between 1 and 65535")
    return parsed


def validate_http_origin(value: str, *, allow_trailing_slash: bool = False) -> SplitResult:
    parsed = validate_http_url(value)
    allowed_paths = {"", "/"} if allow_trailing_slash else {""}
    if parsed.path not in allowed_paths or "?" in value or "#" in value:
        raise ValueError("HTTP(S) origins must not contain a path, query or fragment")
    return parsed
