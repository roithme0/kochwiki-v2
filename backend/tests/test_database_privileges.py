from sqlalchemy import text

from app.infrastructure.database.session import engine


def test_backend_uses_restricted_database_owner_with_pgvector() -> None:
    with engine.connect() as connection:
        role = connection.execute(text(
            "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls "
            "FROM pg_roles WHERE rolname = current_user"
        )).one()
        assert not any(role)
        assert connection.scalar(text(
            "SELECT pg_get_userbyid(datdba) = current_user "
            "FROM pg_database WHERE datname = current_database()"
        )) is True
        assert connection.scalar(text(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        )) is True
