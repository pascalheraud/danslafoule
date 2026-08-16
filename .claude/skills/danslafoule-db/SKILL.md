---
name: danslafoule-db
description: Dans la foule database conventions — primary key strategy, timestamp columns, and schema rules for every table in the PostgreSQL schema.
---

# Dans la foule — database conventions

This skill documents the conventions that apply to every table in the `danslafoule` PostgreSQL schema, independent of any specific business feature. See [[danslafoule]] for the overall project architecture, and [[postgresql]] / [[sqlalchemy]] for the general tool conventions this project builds on.

## Table naming

- Tables are named in the singular, like a class/entity name (`message`), per the generic `backend/generic/db` skill's naming rule — not plural (`messages`).
- Join/relation tables, if any are ever needed, combine both related entity names, singular, separated by an underscore.

## Schema and search_path

- All application tables live in the `danslafoule` schema (not `public`) — see [[postgresql]]'s generic schema rule.
- The `search_path` is set **only at the backend's SQLAlchemy engine level**, per connection (`connect_args={"options": "-c search_path=danslafoule"}` in `app/core/database.py`) — deliberately not database-wide (no `ALTER DATABASE ... SET search_path`), so the database's own default stays untouched.
- Any other client (`psql`, a GUI tool, an ad hoc script) gets Postgres's plain default `search_path` (typically `"$user", public`) and must either schema-qualify its queries (`SELECT * FROM danslafoule.message`) or set its own session `search_path` explicitly (`SET search_path TO danslafoule;`).
- The DB role is `danslafouleapp`, deliberately named differently from the `danslafoule` schema — so `"$user"` in a plain `psql` session never accidentally resolves to the app schema, which would otherwise mask the fact that `search_path` isn't actually configured for that session.

## Primary keys and business identifiers

- Every table uses a `bigint generated` (identity) technical primary key.
- Business/external identifiers (e.g. UUIDs exposed via the API) are stored as a separate unique/indexed column, never as the PK.

## Timestamps

- Every table has a `created_at` column, set via a database-side default to the current timestamp at insertion time — not set by application code.
- Every table has an `updated_at` column, updated by the repository layer on every update operation for that row — application-side, not a DB trigger. Repository update methods must set it explicitly on each write.
- A table may additionally have its own business-meaning timestamp distinct from these generic audit columns (e.g. `message.received_at`, the server-assigned receipt time that the API contract and any TTL purge logic actually key off) — don't conflate that with `created_at`, even if they'd hold the same value in practice.

## Foreign keys and cascading deletes

- No `ON DELETE CASCADE` on foreign keys (per [[postgresql]]'s generic rule) — cascading deletes are handled explicitly in application code (repository/service layer), not by the FK constraint.

## Update rule

As soon as a new cross-table persistence convention is validated (e.g. a new standard column, a new storage type for a recurring kind of data), document it here rather than repeating it ad hoc in each feature's spec.
