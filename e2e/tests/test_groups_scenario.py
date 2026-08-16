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

    page.reload()

    assert not app_page.is_onboarding_visible()
    app_page.wait_for_home()
    page.get_by_text("Festival crew", exact=True).wait_for()


def test_persona_c_creates_a_group(page: Page, app_url: str, builder: DanslafouleTestDataBuilder) -> None:
    builder.apply()

    app_page = AppPage.open(page, app_url)
    app_page.complete_onboarding("Chloe")
    app_page.create_group("Festival crew")

    page.get_by_text("Festival crew", exact=True).wait_for()
    assert len(app_page.group_uuid()) == 36


def test_persona_d_joins_an_existing_group(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    chloe_context = browser.new_context()
    chloe_page = AppPage.open(chloe_context.new_page(), app_url)
    chloe_page.complete_onboarding("Chloe")
    chloe_page.create_group("Festival crew")
    group_uuid = chloe_page.group_uuid()

    dan_context = browser.new_context()
    dan_page = AppPage.open(dan_context.new_page(), app_url)
    dan_page.complete_onboarding("Dan")
    dan_page.join_group(group_uuid)

    assert "Hello, I'm Dan" in dan_page.message_contents()
    chloe_page.wait_for_message("Hello, I'm Dan")

    dan_context.close()
    chloe_context.close()


def test_persona_e_a_and_b_exchange_a_message_not_deleted_on_delivery(
    browser: Browser, app_url: str, builder: DanslafouleTestDataBuilder
) -> None:
    builder.apply()

    a_context = browser.new_context()
    a_page = AppPage.open(a_context.new_page(), app_url)
    a_page.complete_onboarding("A")
    a_page.create_group("Crew")
    group_uuid = a_page.group_uuid()

    b_context = browser.new_context()
    b_page = AppPage.open(b_context.new_page(), app_url)
    b_page.complete_onboarding("B")
    b_page.join_group(group_uuid)

    a_page.send_message("hi")
    a_page.wait_for_message("hi")
    b_page.wait_for_message("hi")

    # The message isn't deleted just because both clients have received it —
    # only server-side TTL expiration removes it (spec §4), not delivery.
    assert builder.count_rows(DanslafouleTable.MESSAGE) >= 1

    a_context.close()
    b_context.close()
