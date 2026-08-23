import time

from playwright.sync_api import Browser, Page

from pages.app_page import AppPage
from testdata import DanslafouleTable, DanslafouleTestDataBuilder


def test_persona_a_first_install_signs_up(page: Page, app_url: str, builder: DanslafouleTestDataBuilder) -> None:
    builder.apply()

    app_page = AppPage.open(page, app_url)
    assert app_page.is_onboarding_visible()

    app_page.complete_onboarding("Alice")

    page.get_by_text("No groups yet", exact=False).wait_for()


def test_persona_b_reopens_app_and_already_exists(page: Page, app_url: str) -> None:
    app_page = AppPage.open(page, app_url)
    app_page.complete_onboarding("Bob")
    app_page.create_group("Festival crew")

    # Reload on a client-side route (/groups/:id): stays on the group
    # screen, same as a real browser refresh — it doesn't bounce to Home.
    page.reload()
    assert not app_page.is_onboarding_visible()
    page.locator('[data-testid="send-message-button"]').wait_for()

    page.goto(app_url)
    app_page.wait_for_home()
    app_page.group_card("Festival crew").wait_for()


def test_persona_c_creates_a_group(page: Page, app_url: str, builder: DanslafouleTestDataBuilder) -> None:
    builder.apply()

    app_page = AppPage.open(page, app_url)
    app_page.complete_onboarding("Chloe")
    app_page.create_group("Festival crew")

    assert len(app_page.group_id()) == 36


def test_persona_d_joins_an_existing_group_via_invite(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    chloe_context, chloe_page = AppPage.open_in_new_context(browser, app_url)
    chloe_page.complete_onboarding("Chloe")
    chloe_page.create_group("Festival crew")
    invite = chloe_page.copy_invite()

    dan_context, dan_page = AppPage.open_in_new_context(browser, app_url)
    dan_page.complete_onboarding("Dan")
    dan_page.join_group(invite)

    # Joining doesn't emit a visible chat message by itself (the `announce`
    # payload just refreshes the member table) — the group being open with
    # a working send box is the join signal.
    dan_page.send_message("hi from Dan")
    dan_page.wait_for_message("hi from Dan")
    chloe_page.wait_for_message("hi from Dan")

    dan_context.close()
    chloe_context.close()


def test_device_a_creates_device_b_joins_via_invite_chat_and_ack(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    """The §7 acceptance scenario: two devices, text-invite join, a chat
    round-trip with decryption, and an ack recorded back on the sender."""
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("A")
    a_page.create_group("Crew")
    invite = a_page.copy_invite()
    group_id = a_page.group_id()

    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("B")
    b_page.join_group(invite)
    assert b_page.group_id() == group_id

    a_page.send_message("hi")
    a_page.wait_for_message("hi")
    # B receiving and being able to render "hi" proves decryption succeeded
    # — the relay only ever sees ciphertext (spec §5, server opacity).
    b_page.wait_for_message("hi")

    # B's client auto-emits an ack on receipt of a chat message (§6.5); A
    # records it. No UI surface exists for this — see AppPage.has_ack_for_group.
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and not a_page.has_ack_for_group(group_id):
        time.sleep(0.5)
    assert a_page.has_ack_for_group(group_id), "sender never recorded an ack from the recipient"

    a_context.close()
    b_context.close()


def test_persona_e_a_and_b_exchange_a_message_not_deleted_on_delivery(
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

    a_page.send_message("hi")
    a_page.wait_for_message("hi")
    b_page.wait_for_message("hi")

    # The message isn't deleted just because both clients have received it —
    # only server-side TTL expiration removes it (spec §8), not delivery.
    assert builder.count_rows(DanslafouleTable.MESSAGE) >= 1

    a_context.close()
    b_context.close()
