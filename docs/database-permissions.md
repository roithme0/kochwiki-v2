# Database accounts and initialization

All four Kochwiki Compose environments give the backend a restricted PostgreSQL
database owner. It can read/write application data and run Alembic schema
migrations, but has no superuser, database-creation, role-creation, replication or
row-security-bypass privileges. This does not add application authorization.

## Fresh databases

Set the following in the ignored `deployment/.env` for local, staging and
production; the test deployment uses disposable test credentials:

```dotenv
APP_DB_NAME=kochwiki
APP_DB_USER=kochwiki
APP_DB_PASSWORD=replace-with-a-random-url-safe-application-password
POSTGRES_PASSWORD=replace-with-a-different-random-administrator-password
```

Use a URL-safe application password, such as a random 64-character hexadecimal
value, because Compose inserts it into the backend database URL. Use ordinary
database and role identifiers. Pass `--env-file deployment/.env` when running
Compose from the repository root.

The PostgreSQL image creates `POSTGRES_DB` using `APP_DB_NAME` and the separate
`postgres` administrator. The single `deployment/postgres/init-kochwiki.sh` script
creates the restricted application user, installs pgvector as the administrator,
and transfers database ownership to the application user. PostgreSQL 16's default
`public` schema permits its database owner to create application objects. The
historical Alembic `CREATE EXTENSION IF NOT EXISTS vector` statement remains
compatible because the extension is installed before Alembic runs. TCP database
health checks wait for initialization to finish.

The initialization script runs only on empty volumes. Changing `.env` does not
rename databases or roles, rotate stored passwords, or initialize existing
volumes. The existing volume and bind-mount paths are unchanged.

## Local and staging setup

Initialize local and staging from empty database storage; their current data
does not need preserving. Recreate the database containers after clearing the
storage. The PostgreSQL image creates the administrator and database, and the
standard initialization script creates the restricted application user, installs
pgvector and assigns database ownership.

Local uses the `postgresql-data` named volume; staging uses
`deployment/postgresql/data` as a bind mount. Stop the relevant database before
clearing its storage. Both setups discard their old database contents; start
with empty storage so PostgreSQL runs initialization.

Set the desired credentials in each environment before the first startup. Use a
hexadecimal `APP_DB_PASSWORD` to avoid database-URL parsing and Alembic percent
interpolation issues. After clearing storage, run the appropriate Compose file
with its environment file. The backend creates its schema through Alembic.

## Verification

The backend suite checks the role's privileges, database ownership and pgvector,
and exercises schema migrations and application flows through that role. For an
isolated run without publishing the test database port:

```powershell
docker compose -p kochwiki-db-permissions-check -f deployment/docker-compose-test.yml -f deployment/tests/compose.database-role.yml run --rm --build backend-tests
```

Reference: [PostgreSQL database ownership](https://www.postgresql.org/docs/16/sql-alterdatabase.html).
