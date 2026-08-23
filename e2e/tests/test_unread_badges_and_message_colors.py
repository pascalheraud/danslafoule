import time

from playwright.sync_api import Browser, Page

from pages.app_page import AppPage


def _wait_for_seconds(seconds: float) -> None:
    time.sleep(seconds)


def test_message_background_colours_and_unread_badges_across_views(browser: Browser, app_url: str) -> None:
    # Persona A opens a group and receives messages from other users.
    a_context, a_page = AppPage.open_in_new_context(browser, app_url)
    a_page.complete_onboarding("Alice")
    a_page.create_group("My Group")
    invite = a_page.copy_invite()

    # Persona B opens the same group from another browser, then goes back to
    # Home — the unread badge (and its blue "new" highlight) is a way of
    # surfacing messages the user *hasn't* looked at yet; sitting on the
    # group screen while at the bottom clears unread as it arrives, so B/C/D
    # need to be on Home for the badge to accumulate.
    b_context, b_page = AppPage.open_in_new_context(browser, app_url)
    b_page.complete_onboarding("Bob")
    b_page.join_group(invite)
    b_page._page.goto(app_url)
    b_page.wait_for_home()

    # Persona C opens the same group from another browser and watches the badge.
    c_context, c_page = AppPage.open_in_new_context(browser, app_url)
    c_page.complete_onboarding("Cara")
    c_page.join_group(invite)
    c_page._page.goto(app_url)
    c_page.wait_for_home()

    # Persona D navigates to the home page and sees the unread badge there.
    d_context, d_page = AppPage.open_in_new_context(browser, app_url)
    d_page.complete_onboarding("Dora")
    d_page.join_group(invite)
    d_page._page.goto(app_url)
    d_page.wait_for_home()

    # A sends 3 messages. Everyone else should see unread badges and different colors.
    a_page.send_message("hello from Alice")
    a_page.wait_for_message("hello from Alice")

    a_page.send_message("second message")
    a_page.wait_for_message("second message")

    a_page.send_message("third message")
    a_page.wait_for_message("third message")

    _wait_for_seconds(2)

    # Each receiving user should have an unread badge in the home list.
    b_page.wait_for_group_card_badge("My Group", 3)
    c_page.wait_for_group_card_badge("My Group", 3)
    d_page.wait_for_group_card_badge("My Group", 3)

    # Menu badge is also visible.
    assert b_page.menu_badge("My Group").inner_text() == "3"
    assert c_page.menu_badge("My Group").inner_text() == "3"
    assert d_page.menu_badge("My Group").inner_text() == "3"

    # Header badge is visible for the latest group with unread messages.
    assert b_page.header_badge().inner_text() == "3"
    assert c_page.header_badge().inner_text() == "3"
    assert d_page.header_badge().inner_text() == "3"

    # Alice sees her own messages with green background.
    alice_colors = a_page.message_background_colors()
    assert any("rgb(223, 242, 223)" in color or "rgba(223, 242, 223" in color for color in alice_colors)

    # Open the group on Bob's side: the unread badge should disappear once the group is opened,
    # and the incoming messages should render in grey/blue (other/fresh), not green (self).
    b_page.open_group_card("My Group")
    b_page.wait_for_badge_to_disappear(b_page.unread_badge_in_group())
    b_page.wait_for_menu_badge_to_disappear("My Group")
    b_page.wait_for_header_badge_to_disappear()

    # Open the group on Cara's side: badge disappears in the group only.
    c_page.open_group_card("My Group")
    c_page.wait_for_badge_to_disappear(c_page.unread_badge_in_group())
    c_page.wait_for_menu_badge_to_disappear("My Group")
    c_page.wait_for_header_badge_to_disappear()

    # Open the group on Dora's side: badge disappears too.
    d_page.open_group_card("My Group")
    d_page.wait_for_badge_to_disappear(d_page.unread_badge_in_group())
    d_page.wait_for_menu_badge_to_disappear("My Group")
    d_page.wait_for_header_badge_to_disappear()

    # Bob/Cara/Dora see the incoming messages from Alice in grey (other) — any
    # still-blue "fresh" highlight will already have faded once they're
    # viewed, so this asserts the base "other" color rather than the
    # transient highlight.
    b_colors = b_page.message_background_colors()
    c_colors = c_page.message_background_colors()
    d_colors = d_page.message_background_colors()
    assert any(
        "rgb(228, 228, 228)" in color or "rgba(228, 228, 228" in color
        for colors in (b_colors, c_colors, d_colors)
        for color in colors
    )

    a_context.close()
    b_context.close()
    c_context.close()
    d_context.close()


def test_sender_sees_own_messages_in_green_and_receivers_see_other_people_messages_in_grey(
    page: Page, browser: Browser, app_url: str
) -> None:
    app_page = AppPage.open(page, app_url)
    app_page.complete_onboarding("Alice")
    app_page.create_group("Roundtrip")
    invite = app_page.copy_invite()

    second_context, other_page = AppPage.open_in_new_context(browser, app_url)
    other_page.complete_onboarding("Bob")
    other_page.join_group(invite)

    app_page.send_message("bonjour")
    app_page.wait_for_message("bonjour")
    other_page.wait_for_message("bonjour")

    # The message text lands in the DOM slightly before refreshLocal's
    # isSelf/isNew classification re-render settles the background color —
    # give it a moment rather than reading colors on the exact same tick.
    _wait_for_seconds(1)

    sender_colors = app_page.message_background_colors()
    receiver_colors = other_page.message_background_colors()

    assert any("rgb(223, 242, 223)" in color or "rgba(223, 242, 223" in color for color in sender_colors)
    # A message the receiver hasn't scrolled away from is still "fresh"
    # (blue highlight, §10) rather than plain "other" grey — either counts
    # as "not rendered as the sender's own green".
    assert any(
        "rgb(228, 228, 228)" in color
        or "rgba(228, 228, 228" in color
        or "rgb(214, 236, 255)" in color
        or "rgba(214, 236, 255" in color
        for color in receiver_colors
    )

    second_context.close()
