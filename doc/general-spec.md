# Dans la foule — general application spec

Current-state description of what the app does, from a product/functional point of view — no
implementation detail (no file paths, code symbols, or module names). For the technical
communication protocol between devices, see
[`doc/dans-la-foule-protocol-spec-en.md`](dans-la-foule-protocol-spec-en.md).

## 1. Product

Dans la foule helps people find and talk to their friends in large crowds (festivals, ...) where
mobile network coverage is poor or absent. It runs as a mobile app (Android) and as a web app.

## 2. Identity

- On first use, the app assigns the device a private identity and asks for a display name (pseudo).
- The pseudo can be changed at any time; everyone in every group the user belongs to is notified of
  the change.
- There is no account, login, or password — identity is local to the device.
- Two separate keys protect the user: a personal identity key, proving which device authored a given
  message without revealing who that device belongs to, and a per-group key, shared only by that
  group's members, which is what actually locks and unlocks that group's messages. Knowing one group's
  key never grants access to another group, and the personal identity key alone never grants access to
  any group's content.

## 3. Groups

- A user can create a group, or join one using an invite (a QR code or a shareable text/link).
- Creating or joining a group makes the user visible to the other members of that group.
- Each group has a members list, viewable at any time, showing every member's pseudo, including the
  user themselves, and how recently they were active.
- When someone joins a group, the other members see a short notice announcing it.
- A group with no activity for a while is automatically paused (no more background updates); the
  user can also pause or resume a group manually at any time.
- Unread messages are counted per group and shown in the group list, the app menu, and the group's
  own screen.
- A connectivity indicator is always visible, showing whether the app currently has a working
  connection to the server; tapping it shows more detail, including what happens to messages while
  offline.

## 4. Messaging

- Members of a group can exchange text messages, visible to every member of that group.
- Message content is private to the group's members — nobody outside the group, including the
  service itself, can read it.
- Sending a message works even without a network connection: the message is shown immediately,
  marked as not yet sent, and delivered automatically as soon as connectivity returns.
- Each of the user's own messages shows a delivery status: not yet sent, sent, seen by some
  recipients, or seen by everyone in the group — shown as a check mark that fills in and turns green
  as more members see it, similar to other messaging apps.
- Tapping any message — the user's own or another member's — shows its delivery details: the sender
  is listed first and clearly marked as such, followed by every other member who was part of the
  group when the message was sent, showing whether each of them has seen it yet.
- A message's expected recipients are fixed at the moment it is sent: someone who joins the group
  later is never treated as having missed earlier messages, and only appears as an expected
  recipient on messages sent after they joined.
- New messages are highlighted briefly when they arrive; the conversation auto-scrolls to the latest
  message unless the user has scrolled up to read history, in which case a button lets them jump back
  down.
- Messages are not stored forever on the server — only long enough to be delivered — but stay
  available on each device that has received them.

## 5. Update rule

Per [[danslafoule]] §11: this document is refreshed at the end of every implementation plan so it
stays an accurate description of the app's functionality as it stands — amend a section in place
when behavior changes, add a section for a new area. It describes product functionality only, in
plain terms: no rationale, no history, no implementation detail, no deferred/discarded options —
those stay in the per-issue `doc/issues/*/spec.md` files and `CHANGELOG.md`.
