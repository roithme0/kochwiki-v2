from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.identity.models.user import User
from app.identity.schemas.oidc import Identity


def map_identity(session: Session, identity: Identity) -> User:
    statement = insert(User).values(
        issuer=identity.iss,
        subject=identity.sub,
        email=identity.email,
        display_name=identity.display_name,
    )
    statement = statement.on_conflict_do_update(
        constraint="uq_user_identity",
        set_={
            "email": statement.excluded.email,
            "display_name": statement.excluded.display_name,
        },
    ).returning(User)
    return session.scalars(
        statement, execution_options={"populate_existing": True}
    ).one()
