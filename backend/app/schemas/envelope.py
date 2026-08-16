import base64
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _decode_b64(value: str, expected_len: int | None, field_name: str) -> bytes:
    try:
        decoded = base64.b64decode(value, validate=True)
    except Exception as exc:
        raise ValueError(f"{field_name} is not valid base64") from exc
    if expected_len is not None and len(decoded) != expected_len:
        raise ValueError(f"{field_name} must decode to {expected_len} bytes, got {len(decoded)}")
    return decoded


class Envelope(BaseModel):
    """The transport-agnostic envelope (protocol spec §5).

    The backend only validates this outer shape — it never sees the decrypted
    payload, which is the frontend's responsibility (protocol spec §5.1, §12).
    """

    model_config = ConfigDict(populate_by_name=True)

    v: int
    group_id: Annotated[UUID, Field(alias="groupId")]
    message_id: Annotated[str, Field(alias="messageId", min_length=1)]
    sender_pub: Annotated[str, Field(alias="senderPub")]
    nonce: str
    ciphertext: str
    signature: str
    timestamp: int

    @field_validator("v")
    @classmethod
    def check_version(cls, value: int) -> int:
        if value != 1:
            raise ValueError("unsupported envelope version")
        return value

    @field_validator("sender_pub")
    @classmethod
    def check_sender_pub(cls, value: str) -> str:
        _decode_b64(value, 32, "senderPub")
        return value

    @field_validator("nonce")
    @classmethod
    def check_nonce(cls, value: str) -> str:
        _decode_b64(value, 12, "nonce")
        return value

    @field_validator("signature")
    @classmethod
    def check_signature(cls, value: str) -> str:
        _decode_b64(value, 64, "signature")
        return value

    @field_validator("ciphertext")
    @classmethod
    def check_ciphertext(cls, value: str) -> str:
        decoded = _decode_b64(value, None, "ciphertext")
        if len(decoded) == 0:
            raise ValueError("ciphertext must not be empty")
        return value
