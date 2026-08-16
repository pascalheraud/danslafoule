import contextlib
import os
import socket
import subprocess
import time
import urllib.request
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine
from testcontainers.community.postgres import PostgresContainer
from testdatabuilder.generic import DatabaseVendor

from testdata import DanslafouleTable, DanslafouleTestDataBuilder

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"


def _free_port() -> int:
    # Bind to port 0 to let the OS hand back an unused port, then release it —
    # avoids clashing with a developer's own backend already running on 8000.
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def db_url() -> Iterator[str]:
    with PostgresContainer("postgres:16-alpine", driver="psycopg") as postgres:
        yield postgres.get_connection_url()


@pytest.fixture(scope="session")
def db_engine(db_url: str) -> Iterator[Engine]:
    engine = create_engine(db_url)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _build_frontend() -> None:
    # Real production build, mounted by the backend at startup — see app/main.py.
    subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, check=True)


@pytest.fixture(scope="session")
def app_url(db_url: str, _build_frontend: None) -> Iterator[str]:
    backend_python = BACKEND_DIR / ".venv" / "bin" / "python"
    port = _free_port()
    url = f"http://127.0.0.1:{port}"
    process = subprocess.Popen(
        [str(backend_python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": db_url},
    )
    try:
        _wait_for_health(f"{url}/api/health")
        yield url
    finally:
        process.terminate()
        process.wait(timeout=10)


def _wait_for_health(url: str, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            if urllib.request.urlopen(url, timeout=0.5).status == 200:
                return
        except OSError as error:
            last_error = error
            time.sleep(0.2)
    raise TimeoutError(f"App did not become ready at {url}") from last_error


@pytest.fixture
def builder(db_engine: Engine, app_url: str) -> DanslafouleTestDataBuilder:
    # depends on app_url so the app has already created the schema/tables on startup.
    return DanslafouleTestDataBuilder(db_engine, DatabaseVendor.POSTGRESQL).with_delete_all(
        DanslafouleTable.MESSAGE,
    )
