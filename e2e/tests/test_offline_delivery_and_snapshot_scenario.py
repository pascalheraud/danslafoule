import time

from playwright.sync_api import Browser

from pages.app_page import AppPage
from testdata import DanslafouleTestDataBuilder


def _wait_until(predicate, timeout: float = 15, interval: float = 0.5, message: str = "condition never true") -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(interval)
    assert predicate(), message


def test_message_sent_while_offline_is_queued_and_flushes_when_back_online(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("A")
    a_page.create_group("Crew")

    a_context.set_offline(True)
    a_page.send_message("hi offline")
    a_page.wait_for_message("hi offline")
    assert a_page.delivery_status("hi offline") == "pending"

    # Stays pending across at least one poll interval while genuinely offline
    # — no silent drop, no premature "sent".
    time.sleep(6)
    assert a_page.delivery_status("hi offline") == "pending"

    a_context.set_offline(False)
    _wait_until(
        lambda: a_page.delivery_status("hi offline") != "pending",
        message="message never left pending status once back online",
    )

    a_context.close()


def test_delivery_status_progresses_to_acked_by_all_in_two_member_group(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("A")
    a_page.create_group("Crew")
    invite = a_page.copy_invite()

    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("B")
    b_page.join_group(invite)

    # A's own knownMemberPubs snapshot at send time only counts a member A
    # already knows about — wait for B's announce to land before sending, or
    # the message's snapshot would have otherMemberCount 0 and could never
    # read as "ackedByAll" no matter who acks it.
    a_page.wait_for_member("B")

    a_page.send_message("ping")
    a_page.wait_for_message("ping")
    b_page.wait_for_message("ping")

    # B is the only other group member, so once it acks, A's status must
    # reach "ackedByAll" (not stall at "ackedByOne") — see
    # doc/general-spec.md §5's delivery-status derivation.
    _wait_until(
        lambda: a_page.delivery_status("ping") == "ackedByAll",
        message="delivery status never reached ackedByAll with a single other member",
    )

    a_context.close()
    b_context.close()


def test_message_sent_before_new_member_joins_is_not_retroactively_required(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    """The member snapshot feature: a message's expected recipients are fixed
    at send time, so a member joining afterwards never blocks it from
    reading as fully delivered, and only appears as a recipient on messages
    sent after they joined."""
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("A")
    a_page.create_group("Crew")
    invite = a_page.copy_invite()

    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("B")
    b_page.join_group(invite)

    # See the "acked by all" test's identical comment: A must know about B
    # before sending, or msg1's own snapshot would exclude B.
    a_page.wait_for_member("B")

    a_page.send_message("msg1 before carol")
    a_page.wait_for_message("msg1 before carol")
    b_page.wait_for_message("msg1 before carol")
    _wait_until(
        lambda: a_page.delivery_status("msg1 before carol") == "ackedByAll",
        message="msg1 never reached ackedByAll with just A and B",
    )

    c_context, c_page = AppPage.open_in_new_context(browser, app_url)
    c_page.complete_onboarding("Carol")
    c_page.join_group(invite)
    # Let Carol's announce round-trip back to A so she's in A's live member
    # table — otherwise this test wouldn't prove anything (msg2's snapshot
    # would just be empty of Carol too, for the wrong reason).
    a_page.wait_for_member("Carol")

    a_page.send_message("msg2 after carol")
    a_page.wait_for_message("msg2 after carol")

    # msg1's detail must never list Carol — she wasn't known when it was sent.
    a_page.open_message_detail("msg1 before carol")
    assert a_page.receipt_rows().filter(has_text="Carol").count() == 0
    # And its status must still read fully delivered, unaffected by Carol.
    assert a_page.delivery_status("msg1 before carol") == "ackedByAll"
    a_page.close_modal("Message status")

    # msg2's detail must list Carol as an expected (not-yet-acked) recipient.
    a_page.open_message_detail("msg2 after carol")
    assert a_page.receipt_rows().filter(has_text="Carol").count() == 1

    a_context.close()
    b_context.close()
    c_context.close()
