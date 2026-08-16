import base64
import os
import uuid


def make_envelope(
    *,
    group_id: str | None = None,
    message_id: str | None = None,
    v: int = 1,
    timestamp: int = 1_723_600_000_000,
) -> dict:
    """Builds a structurally-valid envelope dict (protocol spec §5) for tests.

    Content isn't real end-to-end crypto (no matching keypair) — the backend
    never verifies signatures or decrypts, only the outer shape (§5.1 is a
    frontend responsibility), so opaque-but-correctly-sized bytes are enough.
    """
    return {
        "v": v,
        "groupId": group_id or str(uuid.uuid4()),
        "messageId": message_id or base64.b64encode(os.urandom(32)).decode(),
        "senderPub": base64.b64encode(os.urandom(32)).decode(),
        "nonce": base64.b64encode(os.urandom(12)).decode(),
        "ciphertext": base64.b64encode(os.urandom(48)).decode(),
        "signature": base64.b64encode(os.urandom(64)).decode(),
        "timestamp": timestamp,
    }
