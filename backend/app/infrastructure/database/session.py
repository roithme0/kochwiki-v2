from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import ORMExecuteState, Session, sessionmaker

from app.core.config import get_settings

# Register ORM models before accessing metadata or opening sessions.
from app.infrastructure.database import models as _models  # noqa: F401
from app.infrastructure.database.metrics import ObservedQueuePool

settings = get_settings()
engine = create_engine(
    settings.database_url, pool_pre_ping=True, poolclass=ObservedQueuePool
)
SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)


@event.listens_for(SessionLocal, "do_orm_execute")
def clear_query_name_for_generated_loads(state: ORMExecuteState) -> None:
    if state.is_relationship_load or state.is_column_load:
        state.update_execution_options(kochwiki_query_name=None)


def get_db() -> Generator[Session]:
    with SessionLocal() as session:
        yield session


def get_write_db() -> Generator[Session]:
    with SessionLocal.begin() as session:
        yield session
