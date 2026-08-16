# Dev database

Provides a local PostgreSQL database to quickly start the development backend.

## Start

```bash
docker compose up -d
```

## Stop

```bash
docker compose down
```

## Default settings

- Database: `danslafoule`
- User: `danslafouleapp`
- Password: `danslafoule`
- Port: `5432`

## Environment variables

```bash
export POSTGRES_DB=danslafoule
export POSTGRES_USER=danslafouleapp
export POSTGRES_PASSWORD=danslafoule
```

## Connection

Example DSN:

```text
postgresql+psycopg://danslafouleapp:danslafoule@localhost:5432/danslafoule
```

## Notes

- This container is intended for local development.
- Data is persisted in the `danslafoule_postgres_data` Docker volume.
- For a production environment, use a stricter configuration with separate secrets.
