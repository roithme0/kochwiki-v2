# Database accounts and existing database rollout

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

## Existing databases: one-time command

Prepare the new environment settings while keeping the old database running.
Use the existing database name and a new application role distinct from the old
administrator (normally `user`). Pause backend writes during the ownership
change and use the usual database backup process. Do not remove storage volumes.
Run this from the repository root, choosing the appropriate Compose file:

```powershell
$setup = @'
set -euo pipefail
bash /docker-entrypoint-initdb.d/10-kochwiki.sh
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set app_user="$APP_DB_USER" --set old_owner="$POSTGRES_USER" <<'SQL'
BEGIN;
ALTER SCHEMA public OWNER TO :"app_user";
SELECT format('ALTER %s %I.%I OWNER TO %I',
  CASE WHEN c.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
  n.nspname, c.relname, :'app_user')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
  AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = :'old_owner')
  AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE classid = 'pg_class'::regclass AND objid = c.oid AND deptype = 'e')
ORDER BY CASE WHEN c.relkind = 'S' THEN 1 ELSE 0 END \gexec
SELECT format('ALTER TYPE %I.%I OWNER TO %I', n.nspname, t.typname, :'app_user')
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e'
  AND t.typowner = (SELECT oid FROM pg_roles WHERE rolname = :'old_owner') \gexec
COMMIT;
SQL
'@
$adminSecret = Read-Host 'Existing database administrator password' -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
$encodedSetup = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($setup.Replace("`r`n", "`n")))
try {
    $encodedSetup | docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml run --rm --no-deps -T -e PGHOST=db -e POSTGRES_USER=user -e PGPASSWORD --entrypoint bash db -c 'set -o pipefail; base64 -d | bash'
    if ($LASTEXITCODE -ne 0) { throw 'Database role setup failed' }
} finally {
    $env:PGPASSWORD = $null
}
```

This runs the same initializer against the existing database using the old
administrator, then transfers Kochwiki's existing tables, sequences and enums
in `public`. It preserves rows, sequence values and ownership of extensions and
other databases. Objects outside this schema or owned by another role require
separate review. It deliberately avoids `REASSIGN OWNED`, which would also
transfer shared databases and tablespaces belonging to the administrator.

Run this once with a new role. Initialization is transactional and fails if the
role already exists. Ownership transfer uses a second transaction; if it fails
after initialization succeeds, correct the error and rerun only the ownership
SQL, not the initialization step.

After success, deploy the updated containers with their existing storage. The
backend connects as the new restricted role and continues running Alembic at
startup. The former `user` stays an administrator; an existing volume does not
gain a `postgres` administrator merely because the Compose configuration changes.
`POSTGRES_PASSWORD` initializes that account only on fresh volumes. No running
application environment is migrated automatically by this code change.

## Verification

The backend suite checks the role's privileges, database ownership and pgvector,
and exercises schema migrations and application flows through that role. For an
isolated run without publishing the test database port:

```powershell
docker compose -p kochwiki-db-permissions-check -f deployment/docker-compose-test.yml -f deployment/tests/compose.database-role.yml run --rm --build backend-tests
```

References: [PostgreSQL database ownership](https://www.postgresql.org/docs/16/sql-alterdatabase.html)
and [REASSIGN OWNED scope](https://www.postgresql.org/docs/16/sql-reassign-owned.html).
