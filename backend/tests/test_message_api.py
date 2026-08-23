import base64
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import reset_rate_limits
from tests.envelope_factory import make_envelope


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    reset_rate_limits()
    yield


def test_post_message_accepts_valid_envelope(client: TestClient) -> None:
    group_id = str(uuid.uuid4())
    envelope = make_envelope(group_id=group_id)

    response = client.post(f"/api/v1/groups/{group_id}/messages", json=envelope)

    assert response.status_code == 201


def test_get_messages_returns_posted_envelope(client: TestClient) -> None:
    group_id = str(uuid.uuid4())
    envelope = make_envelope(group_id=group_id)
    client.post(f"/api/v1/groups/{group_id}/messages", json=envelope)

    response = client.get(f"/api/v1/groups/{group_id}/messages")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["envelope"] == envelope
    assert isinstance(body[0]["cursor"], int)


def test_get_messages_since_uses_cursor_not_envelope_timestamp(client: TestClient) -> None:
    # envelope.timestamp is client-clock and unrelated to server ordering —
    # set it far in the future to prove `since` filtering ignores it and only
    # compares against the server-assigned, monotonically increasing cursor.
    group_id = str(uuid.uuid4())
    envelope = make_envelope(group_id=group_id, timestamp=9_999_999_999_999)
    client.post(f"/api/v1/groups/{group_id}/messages", json=envelope)

    first_response = client.get(f"/api/v1/groups/{group_id}/messages")
    cursor = first_response.json()[0]["cursor"]

    assert client.get(f"/api/v1/groups/{group_id}/messages", params={"since": cursor}).json() == []
    assert client.get(f"/api/v1/groups/{group_id}/messages", params={"since": cursor - 1}).json() != []


def test_get_messages_since_excludes_already_seen_envelopes(client: TestClient) -> None:
    group_id = str(uuid.uuid4())
    first = make_envelope(group_id=group_id)
    second = make_envelope(group_id=group_id)
    client.post(f"/api/v1/groups/{group_id}/messages", json=first)
    first_cursor = client.get(f"/api/v1/groups/{group_id}/messages").json()[0]["cursor"]
    client.post(f"/api/v1/groups/{group_id}/messages", json=second)

    response = client.get(f"/api/v1/groups/{group_id}/messages", params={"since": first_cursor})

    assert response.status_code == 200
    assert [item["envelope"]["messageId"] for item in response.json()] == [second["messageId"]]


def test_resend_bumps_cursor_so_it_is_visible_again_past_a_client_watermark(client: TestClient) -> None:
    group_id = str(uuid.uuid4())
    envelope = make_envelope(group_id=group_id)
    client.post(f"/api/v1/groups/{group_id}/messages", json=envelope)
    first_cursor = client.get(f"/api/v1/groups/{group_id}/messages").json()[0]["cursor"]

    # A client that already polled past first_cursor would see nothing more...
    assert client.get(f"/api/v1/groups/{group_id}/messages", params={"since": first_cursor}).json() == []

    # ...until the message is resent (§6.5): same messageId, unchanged content.
    client.post(f"/api/v1/groups/{group_id}/messages", json=envelope)
    response = client.get(f"/api/v1/groups/{group_id}/messages", params={"since": first_cursor})

    assert [item["envelope"]["messageId"] for item in response.json()] == [envelope["messageId"]]


def test_post_message_rejects_group_id_mismatch(client: TestClient) -> None:
    path_group_id = str(uuid.uuid4())
    envelope = make_envelope(group_id=str(uuid.uuid4()))

    response = client.post(f"/api/v1/groups/{path_group_id}/messages", json=envelope)

    assert response.status_code == 400


class TestMalformedEnvelopeRejected:
    """A well-formed JSON body whose fields don't satisfy the envelope contract
    (protocol spec §5) must be rejected with 400 and never persisted."""

    def _post(self, client: TestClient, group_id: str, envelope: dict):
        return client.post(f"/api/v1/groups/{group_id}/messages", json=envelope)

    def test_missing_field(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        del envelope["signature"]

        assert self._post(client, group_id, envelope).status_code == 400

    def test_unsupported_version(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id, v=2)

        assert self._post(client, group_id, envelope).status_code == 400

    def test_invalid_group_id_uuid(self, client: TestClient) -> None:
        envelope = make_envelope(group_id="not-a-uuid")

        assert self._post(client, "not-a-uuid", envelope).status_code == 400

    def test_sender_pub_not_base64(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["senderPub"] = "not-valid-base64!!"

        assert self._post(client, group_id, envelope).status_code == 400

    def test_sender_pub_wrong_length(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["senderPub"] = base64.b64encode(b"too-short").decode()

        assert self._post(client, group_id, envelope).status_code == 400

    def test_nonce_wrong_length(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["nonce"] = base64.b64encode(b"short").decode()

        assert self._post(client, group_id, envelope).status_code == 400

    def test_signature_wrong_length(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["signature"] = base64.b64encode(b"too-short-signature").decode()

        assert self._post(client, group_id, envelope).status_code == 400

    def test_empty_ciphertext(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["ciphertext"] = ""

        assert self._post(client, group_id, envelope).status_code == 400

    def test_message_id_empty(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["messageId"] = ""

        assert self._post(client, group_id, envelope).status_code == 400

    def test_timestamp_wrong_type(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["timestamp"] = "not-a-number"

        assert self._post(client, group_id, envelope).status_code == 400

    def test_rejected_envelope_is_not_persisted(self, client: TestClient) -> None:
        group_id = str(uuid.uuid4())
        envelope = make_envelope(group_id=group_id)
        envelope["signature"] = "invalid"
        self._post(client, group_id, envelope)

        response = client.get(f"/api/v1/groups/{group_id}/messages")

        assert response.json() == []
