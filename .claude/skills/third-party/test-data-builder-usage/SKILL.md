---
name: test-data-builder-usage
description: How to consume the published TestDataBuilder library (Python port, testdatabuilder package) from another project — dependency setup and mapping your own schema to TestTable/TestColumn/Data. PostgreSQL only, for now.
---

<!-- Source: https://github.com/pascalheraud/test-data-builder-py (copy this file to update it) -->

# Using TestDataBuilder (as a dependency)

This skill is for a project that **consumes** the published `testdatabuilder`
package. For the full model behind it (`TestDataBuilder`, `Data`,
`TestTable`, `TestColumn`, template patterns, naming, lifecycle), see
[USERGUIDE.md](../../../USERGUIDE.md) — this skill is the condensed version,
covering what's specific to wiring the real library into a consuming
project.

For decisions behind maintaining *this library's own codebase* (Postgres-only
scope, the bookstore example, internals), see [[test-data-builder-library]]
instead — that one is for people changing the library, not people using it.

**PostgreSQL only, for now.** `DatabaseVendor` has `MARIADB`/`MYSQL`/`ORACLE`
members for shape parity with the Java original this library ports, but
only `DatabaseVendor.POSTGRESQL` is actually implemented — the others raise
`NotImplementedError` the first time `create()`/`apply()` tries to insert a
row.

## Install

Not published to PyPI (or GitHub Packages) — install directly from the git
repository, pinned to a tag or commit rather than `main` so the dependency
doesn't silently move underneath the consuming project:

```bash
# Poetry
poetry add --group dev git+https://github.com/pascalheraud/test-data-builder-py.git#v1.1.1

# pip
pip install git+https://github.com/pascalheraud/test-data-builder-py.git@v1.1.1

# requirements.txt
test-data-builder @ git+https://github.com/pascalheraud/test-data-builder-py.git@v1.1.1
```

Poetry's `#<ref>` and pip's `@<ref>` syntax both accept a tag, branch, or
commit SHA. `poetry.lock`/pip's resolution then pins the exact commit, so
reinstalling later doesn't pick up an unreviewed change even if the tag is
later force-moved. Upgrading is bumping the pinned ref and reinstalling —
no separate registry step, the git ref *is* the version.

## Wiring your schema in

Three things a consuming project writes itself — none of them ship with the
library:

1. **One `TestColumn` mixin per table**, an `Enum` with one member per
   column, mapping to the SQL column name.
2. **One `TestTable` mixin**, an `Enum` with one member per table, pairing
   the SQL table name with that table's column enum.
3. **A `TestDataBuilder` subclass** with one `new_xxx()` template method per
   table (plus `new_xxx_for_current_yyy()`, cluster, partial, and
   parameterized variants as needed — see
   [USERGUIDE.md § Template patterns](../../../USERGUIDE.md#template-patterns)
   for when to reach for each).

```python
from enum import Enum
from testdatabuilder.generic import Data, DatabaseVendor, TestColumn, TestDataBuilder, TestTable


class PublisherColumn(TestColumn, Enum):
    ID = "id"
    NAME = "name"

    @property
    def sql_name(self) -> str:
        return self.value


class MyTable(TestTable, Enum):
    PUBLISHER = ("publisher", PublisherColumn)

    def __init__(self, sql_name, column_enum):
        self._sql_name = sql_name
        self._column_enum = column_enum

    @property
    def sql_name(self) -> str:
        return self._sql_name

    @property
    def columns(self):
        return list(self._column_enum)


class MyTestDataBuilder(TestDataBuilder):

    def new_publisher(self) -> Data:
        publisher = self._new_data(MyTable.PUBLISHER)
        index = publisher.index
        return self._register(publisher.set_column(PublisherColumn.NAME, f"Publisher {index}"))
```

```python
builder = MyTestDataBuilder(engine, DatabaseVendor.POSTGRESQL)
builder.new_publisher()
builder.apply()  # delete() then create()
```

`TestColumn`/`TestTable` are plain base classes (not `abc.ABC`) — Python's
`EnumMeta` and `ABCMeta` don't compose, and every table/column mixes one of
these in alongside `Enum`. Don't switch them to `ABC` in your own subclasses
either, for the same reason.

## Where the `Engine`/`Connection`/`Session` comes from

`TestDataBuilder(connectable, vendor)` accepts an `Engine`, a `Connection`,
or a `Session` (since `v1.1.0`) — whichever you pass decides who manages
the transaction. Full explanation in
[USERGUIDE.md § Engine, Connection, or Session — which to pass](../../../USERGUIDE.md#engine-connection-or-session--which-to-pass).

- **Repository test isolated by transaction rollback** (the common case):
  pass the same `Connection`/`Session` your test fixture already wraps in
  an outer transaction — reuse it directly, don't stand up a second
  `Engine`/container. The builder never commits/rolls back on its own, so
  everything it inserts disappears with the rest of the transaction when
  the fixture rolls back in teardown. No separate cleanup step needed —
  this replaces the old "give the builder session scope + truncate in
  teardown" workaround (below) for any project on `v1.1.0`+.
- **E2E test**: build a plain `Engine` from a Testcontainers connection
  string (`create_engine(container.get_connection_url())`) — the same
  container your app under test is wired to. No surrounding transaction to
  roll back here, so `apply()`'s delete-then-insert is the cleanup
  mechanism instead (see below).

## `apply()` vs `create()`/`delete()` alone

Default to `apply()`. Reach for `create()` alone only when the tables are
already known-clean (fresh Testcontainers database, or a repository test
that gets rollback isolation from its fixture/base class) or when adding a
second batch of `Data` mid-test after an earlier `apply()` already ran —
`create()` never deletes and only inserts rows not yet marked `is_added`,
so it's safe to call repeatedly. Full table in
[USERGUIDE.md § apply/delete/create](../../../USERGUIDE.md#apply-delete-create-which-one-to-call).

**If your project is still on an `Engine`-only builder** (pre-`v1.1.0`, or
deliberately not passing the test's own `Connection`/`Session`) **and you
reuse a builder instance across several tests via a shared/session-scoped
`Engine`/container**, `builder.delete()` alone in teardown only clears
tables *that specific builder instance* touched — a fresh builder per test
knows about nothing. Either give the builder itself session/module scope
too (so its `_to_delete_tables` tracking persists), or truncate explicitly
in teardown. See this repo's own `tests/conftest.py` for a concrete example
of the truncation approach — it's deliberately still `Engine`-based (to
exercise that code path in the library's own tests), not evidence that
`Connection`/`Session` mode is unavailable to consuming projects.

## Things easy to miss

- **A table your templates never seed** (an audit/usage log the app writes
  as a side effect): override `delete()`, call `self._delete_table(MyTable.X)`
  *last*, then `super().delete()` — see
  [USERGUIDE.md § A table your templates never seed](../../../USERGUIDE.md#a-table-your-templates-never-seed)
  for why last-called means first-deleted.
- **A column needing a raw SQL expression** (PostGIS point, `CAST`, enum
  coercion): wrap the value in `SqlExpression("...", *params)` instead of a
  plain literal.
- **A project-specific value type** (a custom date/money type): override
  `set_data_column` and tag the relevant `TestColumn` members with a
  `target_type` property — don't convert inline at every `set_column()`
  call site.
- **Read-back assertions**: add a named method on your builder subclass
  (`current_order_status(order)`) using `self.engine`, rather than inlining
  a `SELECT` at each call site.

## Full reference

[USERGUIDE.md](../../../USERGUIDE.md) in this repo has the complete
walkthrough with every template pattern, naming (`with_name`), and
vendor-support details. This skill is the condensed "what do I write in my
project" version; the USERGUIDE is the prose version worth reading once
end-to-end.
