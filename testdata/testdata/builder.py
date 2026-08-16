import uuid
from datetime import datetime

from testdatabuilder.generic import Data, TestDataBuilder

from testdata.tables import DanslafouleTable, MessageColumn


class DanslafouleTestDataBuilder(TestDataBuilder):
    def new_message(
        self,
        content: str,
        message_uuid: uuid.UUID | None = None,
        received_at: datetime | None = None,
    ) -> Data:
        message = self._new_data(DanslafouleTable.MESSAGE)
        message.set_column(MessageColumn.UUID, message_uuid or uuid.uuid4())
        message.set_column(MessageColumn.CONTENT, content)
        if received_at is not None:
            message.set_column(MessageColumn.RECEIVED_AT, received_at)
        return self._register(message)
