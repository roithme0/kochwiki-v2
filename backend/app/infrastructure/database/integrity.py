from psycopg.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError


def is_unique_constraint(error: IntegrityError, constraint_name: str) -> bool:
    return (
        isinstance(error.orig, UniqueViolation)
        and error.orig.diag.constraint_name == constraint_name
    )


def flush_for_unique_conflict(
    session: Session, constraint_name: str, message: str
) -> None:
    try:
        session.flush()
    except IntegrityError as error:
        if is_unique_constraint(error, constraint_name):
            raise ConflictError(message) from error
        raise
