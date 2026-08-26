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


def test_group_members_list_shows_self_then_new_joiners(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("Alice")
    a_page.create_group("Crew")
    invite = a_page.copy_invite()

    # Alice's own announce has to round-trip back through the relay before
    # she shows up in her own member table — see members.ts#recordAnnounce.
    a_page.wait_for_member("Alice", timeout=25)
    a_page.open_members()
    assert a_page.member_rows().count() == 1
    a_page.close_modal("Group members")

    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("Bob")
    b_page.join_group(invite)

    a_page.wait_for_member("Bob")

    a_context.close()
    b_context.close()


def test_join_shows_a_system_notice(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    """The exactly-once guard (a second `announce` envelope for an already-
    known member must not duplicate the notice) is covered at the pipeline
    unit-test level (pipeline.test.ts) rather than here: today's UI has no
    path that re-sends a genuine `announce` for a member it already knows
    (Home's join flow short-circuits to an "already a member" toast without
    re-announcing), so there's nothing this level could exercise beyond
    what's already true by construction."""
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("Alice")
    a_page.create_group("Crew")
    invite = a_page.copy_invite()

    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("Bob")
    b_page.join_group(invite)

    a_page.wait_for_system_event("Bob joined the group")

    a_context.close()
    b_context.close()


def test_message_detail_lists_sender_first(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("Alice")
    a_page.create_group("Crew")
    invite = a_page.copy_invite()

    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("Bob")
    b_page.join_group(invite)

    a_page.send_message("hello")
    a_page.wait_for_message("hello")
    b_page.wait_for_message("hello")

    b_page.open_message_detail("hello")
    rows = b_page.receipt_rows()
    _wait_until(lambda: rows.count() >= 1, message="receipt detail never populated")
    first_row = rows.first
    assert "Alice" in first_row.inner_text()
    assert first_row.get_attribute("data-sender") == "true"

    a_context.close()
    b_context.close()


def test_connectivity_indicator_reflects_offline_state(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("Alice")
    a_page.create_group("Crew")

    a_page.wait_for_connectivity_status("online")

    a_context.set_offline(True)
    a_page.send_message("triggers a failed request")
    a_page.wait_for_connectivity_status("offline")

    a_page.open_connectivity_popup()
    a_page.wait_for_text("Not connected")

    a_context.set_offline(False)
    a_page.wait_for_connectivity_status("online")

    a_context.close()
