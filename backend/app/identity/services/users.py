from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.identity.models.user import User
from app.core.exceptions import NotFoundError
from app.identity.schemas.oidc import Identity


def list_users(session: Session) -> Sequence[User]:
    return session.scalars(select(User).order_by(User.id)).all()


def get_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise NotFoundError(f"User with id {user_id} not found")
    return user


def map_identity(session: Session, identity: Identity) -> User:
    statement = insert(User).values(
        issuer=identity.iss,
        subject=identity.sub,
        email=identity.email,
        display_name=identity.display_name,
    )
    statement = statement.on_conflict_do_update(
        constraint="uq_custom_user_identity",
        set_={
            "email": statement.excluded.email,
            "display_name": statement.excluded.display_name,
        },
    ).returning(User)
    return session.scalars(
        statement, execution_options={"populate_existing": True}
    ).one()


def delete_user(session: Session, user_id: int) -> None:
    session.delete(get_user(session, user_id))
    session.flush()
