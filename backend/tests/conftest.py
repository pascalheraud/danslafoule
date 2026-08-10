from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateSchema
from testcontainers.community.postgres import PostgresContainer
from testdatabuilder.generic import DatabaseVendor

from app.core.database import SCHEMA, Base, get_db
from app.main import app
from testdata import DanslafouleTestDataBuilder


@pytest.fixture(scope="session")
def postgres_engine() -> Iterator[Engine]:
    with PostgresContainer("postgres:16-alpine", driver="psycopg") as postgres:
        engine = create_engine(postgres.get_connection_url())
        with engine.begin() as conn:
            conn.execute(CreateSchema(SCHEMA))
        Base.metadata.create_all(bind=engine)
        yield engine
        engine.dispose()


@pytest.fixture
def db_session(postgres_engine: Engine) -> Iterator[Session]:
    # One connection + an outer transaction per test, rolled back at the end —
    # keeps tests isolated without recreating the schema/container each time.
    connection = postgres_engine.connect()
    transaction = connection.begin()
    session_factory = sessionmaker(bind=connection, autoflush=False, autocommit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def builder(db_session: Session) -> DanslafouleTestDataBuilder:
    # Built on db_session (v1.1.0+): the builder executes on the same
    # connection/transaction db_session already wraps, so rows it inserts
    # are rolled back along with everything else in that fixture's teardown
    # — no separate truncate needed.
    return DanslafouleTestDataBuilder(db_session, DatabaseVendor.POSTGRESQL)


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
