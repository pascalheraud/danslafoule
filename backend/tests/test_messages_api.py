import uuid

from fastapi.testclient import TestClient


def test_post_message_returns_content_and_server_received_at(client: TestClient) -> None:
    message_uuid = str(uuid.uuid4())

    response = client.post("/api/messages", json={"uuid": message_uuid, "content": "hello"})

    assert response.status_code == 200
    body = response.json()
    assert body["uuid"] == message_uuid
    assert body["content"] == "hello"
    assert body["received_at"] is not None


def test_list_messages_returns_posted_messages(client: TestClient) -> None:
    client.post("/api/messages", json={"uuid": str(uuid.uuid4()), "content": "first"})
    client.post("/api/messages", json={"uuid": str(uuid.uuid4()), "content": "second"})

    response = client.get("/api/messages")

    assert response.status_code == 200
    contents = [m["content"] for m in response.json()]
    assert contents == ["first", "second"]


def test_list_messages_since_filters_older_messages(client: TestClient) -> None:
    first = client.post("/api/messages", json={"uuid": str(uuid.uuid4()), "content": "first"}).json()
    second = client.post("/api/messages", json={"uuid": str(uuid.uuid4()), "content": "second"}).json()

    response = client.get("/api/messages", params={"since": first["received_at"]})

    contents = [m["content"] for m in response.json()]
    assert contents == [second["content"]]


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
