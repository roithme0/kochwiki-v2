import logging


class AuthQueryFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and len(record.args) == 5:
            arguments = list(record.args)
            path = arguments[2]
            if isinstance(path, str):
                route_path = path.split("?", 1)[0]
                if any(route_path == prefix or route_path.startswith(prefix + "/") for prefix in ("/auth", "/api/auth")):
                    arguments[2] = route_path
                    record.args = tuple(arguments)
        return True


def configure_auth_logging() -> None:
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, AuthQueryFilter) for item in logger.filters):
        logger.addFilter(AuthQueryFilter())
