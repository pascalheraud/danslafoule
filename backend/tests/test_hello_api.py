from fastapi.testclient import TestClient

from testdata import DanslafouleTestDataBuilder


def test_hello_count_endpoint_returns_row_count(client: TestClient, builder: DanslafouleTestDataBuilder) -> None:
    builder.new_hello_worlds(2)
    builder.create()

    response = client.get("/api/hello-count")

    assert response.status_code == 200
    assert response.json() == {"n": 2}


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
