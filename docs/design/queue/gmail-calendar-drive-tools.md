# Google tools

- **Status:** draft
- **Work items:** [Gmail](https://linear.app/zgeoff/issue/GEO-1825), and
  [Calendar and Drive](https://linear.app/zgeoff/issue/GEO-1826). Both build on the
  [Google connection](google-connections.md).

nixie reads, searches and labels your Gmail, sends mail, and reads and changes your calendar and the
Drive files you give it, through one Google connection. Every read asks Google live, inside the
model's turn: nixie syncs nothing and keeps no copy of your mail, events or files. A change or a
send runs as an [action](../../architecture/core/actions.md), and the
[decision point](../../architecture/policy/decision-point.md) decides it before every attempt from
the effects the tool declares and the destinations nixie reads from Google. When an attempt's
outcome is unknown, a read-only check at Google settles it, and nixie never repeats a send blind.

The Gmail tools are `gmail.*`. The `mail.*` tools belong to the assistant's own mailbox in the
[mail design](https://github.com/zgeoff/nixie/pull/1420), which also holds `gmail.wake_set`,
`gmail.wake_list` and `gmail.wake_cancel`, and the `replyWake` argument of `gmail.send` and
`gmail.reply`. The [Google connection](google-connections.md) owns the tokens, the consent and the
scopes. [Tool calls](../../architecture/connectors/tool-calls.md) owns how a call and its errors
reach the model.

## Shape

```mermaid
flowchart LR
  model[model] -->|"gmail.reply"| endpoint[tool endpoint]
  endpoint -->|"1. resolveDestinations: read the message"| gmail[Gmail API]
  endpoint -->|"2. decide"| dp[decision point]
  dp -->|ask| card[send card]
  card -->|approve| queue[action queue]
  dp -->|allow| queue
  queue -->|"3. send, Message-ID holds the action ID"| gmail
  queue -->|"4. unknown: check after 5 min"| sent[Sent-folder check]
```

## Contracts

### The tools

Each tool is a `ConnectorAction` of the Google connector. Effect is the effect its declaration
holds, which rules match on. A `direct` tool runs in the turn, and a `queued` tool runs as an
action.

| Tool                                | Effect  | Runs   | Scope                            | Reconciliation                    |
| ----------------------------------- | ------- | ------ | -------------------------------- | --------------------------------- |
| `gmail.search`                      | `read`  | direct | `gmail.modify`                   | none                              |
| `gmail.read`                        | `read`  | direct | `gmail.modify`                   | none                              |
| `gmail.read_attachment`             | `read`  | direct | `gmail.modify`                   | none                              |
| `gmail.label`                       | `write` | queued | `gmail.modify`                   | check: the threads' labels        |
| `gmail.send`                        | `send`  | queued | `gmail.modify`                   | check: the Sent folder            |
| `gmail.reply`                       | `send`  | queued | `gmail.modify`                   | check: the Sent folder            |
| `calendar.list_calendars`           | `read`  | direct | `calendar.calendarlist.readonly` | none                              |
| `calendar.list_events`              | `read`  | direct | `calendar.events`                | none                              |
| `calendar.read_event`               | `read`  | direct | `calendar.events`                | none                              |
| `calendar.create_event`             | `write` | queued | `calendar.events`                | check: the event ID and marker    |
| `calendar.create_event_with_guests` | `send`  | queued | `calendar.events`                | check: the event ID and marker    |
| `calendar.change_event`             | `write` | queued | `calendar.events`                | check: the event's marker         |
| `calendar.change_event_with_guests` | `send`  | queued | `calendar.events`                | check: the event's marker         |
| `calendar.cancel_event`             | `write` | queued | `calendar.events`                | check: the event is cancelled     |
| `calendar.cancel_event_with_guests` | `send`  | queued | `calendar.events`                | check: the event is cancelled     |
| `calendar.respond`                  | `send`  | queued | `calendar.events`                | check: your response on the event |
| `drive.search`                      | `read`  | direct | `drive.file`                     | none                              |
| `drive.read`                        | `read`  | direct | `drive.file`                     | none                              |
| `drive.create`                      | `write` | queued | `drive.file`                     | check: the file's marker          |
| `drive.change`                      | `write` | queued | `drive.file`                     | check: the file's marker          |

- A tool that acts on an item a connection returned, such as `gmail.reply` on a message, takes its
  connection from the item. Every other tool takes the
  [connection argument](../platform/connectors/connector.md#the-connection-argument) when its caller
  can reach 2 or more Google connections.
- nixie counts every attendee of an event as a guest, except the connection's own account: the
  attendee whose `self` is true, or whose address is the account. A room or other resource counts as
  a guest, because Google emails its owner.
- A marker is a private property that a change writes on the item it changes, so a later check can
  tell whether the change happened, as [the other checks](#the-other-checks) set out.

### Reads

Each tool that reads text returns at most one part of it per call: `part` names the part, counted
from 1, and `parts` gives how many there are.

```ts
gmail.search({ query: 'from:sam@example.org newer_than:7d', limit: 20 });
// → { messages: [{ message: '18c2f0a9b4d1e7c3', thread: '18c2f0a9b4d1e7c3',
//       from: 'Sam Lee <sam@example.org>', to: ['you@example.com'], subject: 'Q3 numbers',
//       date: '2026-11-12T23:04:00Z', snippet: 'Here are the…', labels: ['INBOX', 'Reports'],
//       isUnread: true, hasAttachments: true }],
//     next: 'eyJwIjoyfQ' }   // null on the last page; pass it back as `after`

gmail.read({ message: '18c2f0a9b4d1e7c3', part: 1 });
// → { message, thread, from, replyTo: null, to, cc, subject, date, labels,
//     text: 'Hi, the numbers are in the sheet [L3]…', part: 1, parts: 2,
//     attachments: [{ attachment: '1.2', name: 'q3.csv', type: 'text/csv', bytes: 18233 }] }

gmail.read_attachment({ message: '18c2f0a9b4d1e7c3', attachment: '1.2', part: 1 });
// → { name: 'q3.csv', type: 'text/csv', bytes: 18233, text: 'region,total\n…', part: 1, parts: 1 }
//   an image: text null, and the model gets the image beside the result
//   any other type: text null, parts 0, unsupported: true

calendar.list_events({
  calendar: 'primary',
  from: '2026-11-14T00:00:00+11:00',
  to: '2026-11-21T00:00:00+11:00',
});
// → { events: [{ event: 'a1b2c3d4e5', title: 'Dentist', start: '2026-11-15T09:30:00+11:00',
//       end: '2026-11-15T10:15:00+11:00', isAllDay: false, location: '12 High St',
//       organizer: 'you@example.com', guests: [], yourResponse: null, status: 'confirmed' }],
//     next: null }

drive.read({ file: '1Bx9QvR2…', part: 1 });
// → { file, name: 'Trip plan', type: 'google_doc', modifiedAt: '2026-11-10T04:12:00Z',
//     text: '# Trip plan\n…', part: 1, parts: 3 }
```

### The declarations

Each tool declares an `EffectDeclaration` (policy module), and each tool with a destination resolves
it on the host with `resolveDestinations` on its tool definition (tools module), which returns
`CallDestination[]`. The endpoint calls it before the decision point, in place of reading
destination arguments.

```ts
// gmail.reply's declaration. Every Google tool fills `results` the same way.
const gmailReplyDeclaration: EffectDeclaration = {
  effects: ['send'],
  destinations: [], // resolveDestinations reads them from the message
  amount: null,
  content: ['text'],
  results: { message: 'owner_data', thread: 'owner_data' },
};

// gmail.reply's resolveDestinations, for a message from sam@example.org with Cc kim@example.org
// and replyAll: true
// → { status: 'ok', destinations: [{ value: 'sam@example.org', replyTarget: true },
//                                  { value: 'kim@example.org', replyTarget: false }] }
```

```ts
// The source of each field of a read's result. 'untrusted' is outside content and 'owner_data' is
// your own data. An endorsed field's type cannot carry words (a boolean, a number, a time, a value
// from a fixed list); its output schema carries 'x-endorsed', and its source stays as written.
const mailResultSources = {
  message: 'owner_data', // Gmail's own IDs; not endorsed, because a string can carry words
  thread: 'owner_data',
  labels: 'owner_data', // label names you or nixie made, and Gmail's system labels
  from: 'untrusted', // every header the sender wrote: replyTo, to, cc and subject too
  snippet: 'untrusted',
  text: 'untrusted', // the body, whoever sent it, your own sent mail included
  attachments: 'untrusted', // names and types come from the sender
  date: 'untrusted', // endorsed; so are isUnread and hasAttachments
  part: 'owner_data', // endorsed; so is parts
} as const;
// Calendar: event, calendar and next are 'owner_data'; title, location, description, organizer
// and guests are 'untrusted'; start, end, isAllDay, status and yourResponse are 'untrusted' and
// endorsed. Drive: file and next are 'owner_data'; name and text are 'untrusted'; type, bytes and
// modifiedAt are 'untrusted' and endorsed.
```

| Tool                                | Its destinations                                     | Reply target            |
| ----------------------------------- | ---------------------------------------------------- | ----------------------- |
| `gmail.send`                        | each address in `to`, `cc` and `bcc`                 | none                    |
| `gmail.reply`                       | the recipients it reads from the message             | `Reply-To`, else `From` |
| `calendar.create_event_with_guests` | each guest                                           | none                    |
| `calendar.change_event_with_guests` | each guest before the change, and each guest it adds | none                    |
| `calendar.cancel_event_with_guests` | each guest of the event                              | none                    |
| `calendar.respond`                  | the event's organizer                                | the organizer           |
| every other tool                    | none                                                 | none                    |

- The resolver writes each destination as its bare address, with no display name, in lowercase NFC.
  The decision point gives each one a permission at stage 5, as
  [destinations](../../architecture/policy/decision-point.md#destinations) sets, and the
  [trusted-places design](https://github.com/zgeoff/nixie/pull/1410) reads each as an `address`
  place.
- A reply target covers only the reply or response whose resolver returned that address. An address
  the model writes in an argument is never a reply target, even when it equals a sender or an
  organizer.
- `gmail.reply` marks no reply target when the message sits in Spam or Trash, or when the message's
  `From` is the connection's own account.
- The resolution is a direct read, with the direct call's time budget. When it fails, the call fails
  as a direct call does, and never reaches the decision point.
- The [action hash](../platform/policy/approvals.md#the-proposal) covers the resolved destinations.
  In its attempt, the connector reads the message or event again. When the recipients or guests
  differ, it answers `destinations_changed`, and the action fails and sends to none of them.
- The change and cancel tools with guests send the `etag` of the attempt's read in `If-Match`, so
  Google refuses the write with 412 when the event changed after that read. On a 412 the connector
  reads the event again: when the guests differ, it answers `destinations_changed`; otherwise
  `refused_retryable`.

### The changes

```ts
gmail.label({ threads: ['18c2f0a9b4d1e7c3'], add: ['Reports'], remove: ['INBOX', 'UNREAD'] });
// → done: { threads: ['18c2f0a9b4d1e7c3'], created: [] }   created: user labels the call made

gmail.send({ to: ['sam@example.org'], cc: [], bcc: [], subject: 'Q3 numbers', text: 'Hi Sam, …' });
// → done: { message: '18c2f1…', thread: '18c2f1…' }

gmail.reply({ message: '18c2f0a9b4d1e7c3', text: 'Thanks, got it.', replyAll: false });
// → done: { message, thread }

calendar.create_event_with_guests({
  calendar: 'primary',
  title: 'Q3 review',
  start: '2026-11-18T14:00:00+11:00',
  end: '2026-11-18T14:30:00+11:00',
  guests: ['sam@example.org'],
});
// → done: { event: '0b9d3c4e7a214f0e8c551e6f2a9d4c03', link: 'https://www.google.com/calendar/event?eid=…' }

calendar.change_event_with_guests({
  event: 'a1b2c3d4e5',
  start: '…',
  end: '…',
  addGuests: [],
  removeGuests: [],
});
calendar.cancel_event({ event: 'a1b2c3d4e5' });
calendar.respond({ event: 'k9x8w7v6u5', response: 'accepted' }); // accepted | declined | tentative

drive.create({ name: 'Trip plan', text: '# Trip plan\n…', as: 'google_doc' }); // google_doc | text
drive.change({ file: '1Bx9QvR2…', name: null, text: '# Trip plan\n…' }); // replaces the whole content
```

- `gmail.label` takes up to 50 threads. `add` and `remove` take user label names and the system
  labels `INBOX`, `UNREAD`, `STARRED` and `IMPORTANT`. When `add` names a user label that does not
  exist, the tool creates it.
- `gmail.send` takes up to 20 addresses across `to`, `cc` and `bcc`, and a plain-text body of up to
  100 KB. It sends no attachment and no HTML.
- `gmail.reply` takes its recipients from the message, never from the model: `Reply-To`, else
  `From`, and with `replyAll` the message's `To` and `Cc` too, without your own address. It threads
  the reply with `In-Reply-To`, `References`, the thread ID and the subject.
- A tool without guests has no guest argument. A with-guests tool refuses with `no_guests` when the
  event has no guest before the change and none after it.
- A change or cancel tool without guests reads the event before the decision point and again in its
  attempt, and refuses with `has_guests` when the event has one.
- `drive.change` reads the file in its attempt, and refuses with `shared_file` when the file is
  shared with anyone or sits in a shared drive, because a change there reaches each person who can
  read it.
- `drive.create` makes the file in your My Drive root, shared with no one. With `google_doc` it
  imports the text as Markdown into a Google Doc, and with `text` it makes a plain text file.

### The send card

nixie fills each queued tool's sentence from the call's structured fields, as
[proposals and approvals](../platform/policy/approvals.md#the-proposal) sets, and the model writes
none of it. [Approvals in the client](../platform/channels/approvals.md#cards) holds the card's
layout.

| Tool                                | Sentence                                             | Approve button   |
| ----------------------------------- | ---------------------------------------------------- | ---------------- |
| `gmail.send`                        | Send an email from {from} to {to}: "{subject}"       | Send email       |
| `gmail.reply`                       | Reply to {replyTo} from {from}: "{subject}"          | Send reply       |
| `gmail.label`                       | Label {count} threads: add {add}, remove {remove}    | Label            |
| `calendar.create_event_with_guests` | Invite {guests} to "{title}" on {start}              | Send invitations |
| `calendar.change_event_with_guests` | Change "{title}" on {start} and email {guests}       | Send changes     |
| `calendar.cancel_event_with_guests` | Cancel "{title}" on {start} and email {guests}       | Cancel and email |
| `calendar.respond`                  | Tell {organizer} you {response} "{title}" on {start} | Send response    |
| `calendar.create_event`             | Add "{title}" on {start} to {calendar}               | Add event        |
| `calendar.change_event`             | Change "{title}" on {start}                          | Change event     |
| `calendar.cancel_event`             | Cancel "{title}" on {start}                          | Cancel event     |
| `drive.create`                      | Create "{name}" in Drive                             | Create file      |
| `drive.change`                      | Replace the content of "{name}"                      | Replace content  |

- A mail card shows From (the connection's account), To, Cc, Bcc, Subject, In reply to
  (`gmail.reply` only: the original's sender, date and subject) and the whole body as plain text,
  never HTML. It leaves out an empty Cc or Bcc.
- The card lists each destination beside the permission that covered it, and marks one that no
  permission covered with "no permission".
- A calendar card shows the event's title, times with their zone, calendar, location and each guest.
  A change card shows each changed field before and after.
- A time in a sentence shows the date, the time and the zone, in the zone that the
  [time tool](../../architecture/connectors/time.md) answers in.

### The Sent-folder check

```text
Message-ID: <0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.com>   the action ID @ the sender's domain
```

```ts
// connectors module: the Reconcile of gmail.send and gmail.reply. 'gmail.find_sent' is a read-only
// check that only the action queue calls; no tool list holds it.
const reconcile: Reconcile = {
  kind: 'check',
  tool: 'gmail.find_sent',
  trustNegativeAfterMs: 300_000,
  onNotFound: 'ask',
};
```

The check runs at least 5 minutes after the attempt started, and asks Gmail 2 ways:

1. A search with `rfc822msgid:<the Message-ID>` and `includeSpamTrash`.
2. A list of the `SENT` label with `includeSpamTrash` and `after:` 10 minutes before the attempt
   started, read to its last page, with the `Message-ID` and `X-Google-Original-Message-ID` headers
   of each message. The check never relies on the list's order.

| What the check sees                                             | It answers                           |
| --------------------------------------------------------------- | ------------------------------------ |
| Either way finds a message whose header holds the Message-ID    | found; this row wins over the others |
| Both ways finish and find none                                  | not found                            |
| The list holds more than 200 messages                           | inconclusive                         |
| Any call fails, or Gmail answers in a way the check cannot read | inconclusive                         |

- Found makes the action done, with the found message's ID and thread as its result.
- Not found brings the action to you: "nixie can't tell whether this mail went out". Gmail keeps no
  other trace of a sent mail, so a Sent copy deleted for good looks the same as a mail that never
  went out.
- Only your answer sends the mail again, and that attempt sends the same message with the same
  Message-ID.
- The check reads both headers, because Gmail can replace a `Message-ID` that a client set and keep
  the old one in `X-Google-Original-Message-ID`.
- A sent mail carries no other header that names nixie or the action.

### The other checks

Calendar uses `calendar.find_change` and Drive uses `drive.find_change`, each a read-only check with
`trustNegativeAfterMs: 300_000`. A calendar create's event ID is the action ID without its hyphens,
which fits Google's base32hex event IDs. A 409 on that insert answers done with the event read by
its ID.

```ts
// The marker: one private property per action, written in the same request as its change. Each
// calendar create and change, drive.create and drive.change writes one; a cancel or a respond
// writes none. Calendar keeps it in extendedProperties.private, and Drive in appProperties, which
// only nixie's OAuth client reads.
// key: 'nixie' + the action ID without hyphens; value: the attempt's start, as epoch seconds
{ 'nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03': '1794550000' }
```

| Action             | Found when                                                  | Not found when                             |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------ |
| a calendar create  | a read by the event ID, or a search by the marker, finds it | both answer with nothing                   |
| a calendar change  | the event holds the action's marker                         | the event lacks it, with under 10 markers  |
| a calendar cancel  | the event reads `cancelled`, or 404 or 410                  | the event reads `confirmed` or `tentative` |
| `calendar.respond` | the account's attendee entry holds the response             | never                                      |
| `drive.create`     | a file holds the marker, found by `appProperties` search    | the search finds none                      |
| `drive.change`     | the file holds the action's marker                          | the file lacks it, with under 10 markers   |
| `gmail.label`      | each thread holds every label in `add` and none in `remove` | never                                      |

- Each write keeps the 10 newest of nixie's markers on the item and deletes the older ones, in the
  same request. A later action on the same item can run while an earlier one is unknown, and its
  marker must not hide the earlier one.
- Found wins over every other answer. A check never answers not found while any read it makes fails.
  Every other answer is inconclusive, a response or a label that differs included, because a later
  change can have replaced it.
- A cancel's retry treats a 410 as done.

### The Drive picker

`drive.file` lets nixie see only the files it created and the files you pick for it. You pick files
on the connection's page in the web client:

1. You press "Choose Drive files". The page asks Google's sign-in library for an access token of its
   own, with the scope `drive.file`, `include_granted_scopes: false`, the connection's OAuth client
   ID, and the connection's account as `login_hint`. The page is served with
   `Cross-Origin-Opener-Policy: same-origin-allow-popups`, for Google's sign-in popup.
2. The page opens Google Picker with that token, the client's `picker_key`, and its `project_number`
   as the app ID.
3. The page sends the picked file IDs to `connections.checkPicked`, and shows the result.

```ts
// libs/contract, under `connections`: a read procedure. The server reads each file with the
// connection's own token.
connections.checkPicked({ connection: 'k3x9m2p7qa', files: ['1Bx9QvR2…', '1Zq7…'] });
// → [{ file: '1Bx9QvR2…', name: 'Trip plan', isVisible: true },
//    { file: '1Zq7…', name: null, isVisible: false }]   false: the server cannot read it
```

- The connection's tokens never reach the browser, because they carry `gmail.modify`. The browser's
  own token lives only in the page's memory, and the server never receives it.
- The page drops a token whose `scope` holds anything besides `drive.file`, with an error, before
  the picker sees it.
- The page shows each file that `checkPicked` cannot read as one nixie cannot see, and names the
  likely cause: a pick under another Google account.
- Without `picker_key` and `project_number`, the page hides the button and links the setup step.
- Picking a file sends nothing to the model. The description of `drive.search` tells the model where
  you pick files.

## Constraints

### The read path

- Every read calls Google at the time of the call. nixie keeps no index, cache or copy of mail,
  events or files.
- Each text part is at most the `text_bytes` of the `web_fetch` config section, cut as
  [pages and parts](../../architecture/connectors/web-fetch.md#pages-and-parts) sets. The tool reads
  the item from Google again for each part.
- The text the model read sits in the call's `tool_result` record under that record's own key, so a
  forget of the record removes it.
- A mail whose body has only an HTML part goes to a
  [fetch sandbox](../../architecture/connectors/web-fetch.md#the-fetch-sandbox) for its text, so
  nixie never parses mail HTML on the host. Each link in a body reads as a
  [link ID](../../architecture/connectors/web-fetch.md#link-ids), such as `[L3]`.
- `gmail.read_attachment` reads `text/*` and `application/json` as UTF-8 text, and decodes images as
  [web fetch images](../../architecture/connectors/web-fetch-images.md) does. Every other type
  answers `unsupported`. An item over 25 MB answers `too_large`.
- `drive.read` exports a Google Doc as Markdown, a Sheet's first sheet as CSV and a Slides file as
  plain text, and reads other files as `gmail.read_attachment` does.

### Every tool

- A tool's declared effects never depend on its arguments or on the item it acts on.
- A calendar tool without guests calls Google with `sendUpdates: 'none'`, and a with-guests tool
  with `'all'`, so a `write` tool never makes Google email anyone.
- The change and cancel tools refuse with `not_organizer` when the connection's account does not
  organize the event.
- A queued tool's attempt answers a `ProviderResponse` (connectors module), whose kinds include
  `refused_retryable` and `destinations_changed`. Each Google error maps to one, and a Gmail 403
  with `rateLimitExceeded` or `userRateLimitExceeded` is `refused_retryable`.
- With `calendar.calendarlist.readonly` missing, the Calendar tools take `primary` or a calendar ID
  you give.

### Sends

- nixie has no draft tool. Every send passes the decision point. The starter rule
  `allow-sends-within-limits` ([rules](../platform/policy/rules.md)) allows a send, and it runs at
  once only when each destination has a permission at stage 5 or your consent. Every other send
  waits on its card.
- A send never carries an attachment.

## Decisions

- **The Google tools are `gmail.*`, `calendar.*` and `drive.*`, with the names in
  [the tools](#the-tools).** `mail.*` names only the assistant's own mailbox.
- **Every event change that emails guests is its own `…_with_guests` tool, with the `send` effect.**
  A tool's effects are fixed per tool, and an event with guests is a send.
- **The card sentences and approve buttons are those in [the send card](#the-send-card).**
- **`calendar.respond` is a `send`, and the organizer is its reply target.** Google emails the
  organizer, and an answer to an invitation needs no more permission than a reply.
- **Reads are live.** No store means no sync to keep and no new forget path.
- **The action ID rides in `Message-ID` alone.** The check needs one header, and a header that names
  nixie would tell each recipient you use an assistant.
- **A mail the Sent-folder check does not find comes to you, and nixie never resends it.** A
  duplicate mail to someone outside is worse than asking you once.
- **Recipients and guests come from Google, never from the model's text.**
- **The picker runs on a browser token of its own.** The connection's token carries `gmail.modify`,
  which must never reach page code.
- **`drive.change` refuses a shared file**, so a Drive write never reaches another person.

## Builder decides

- Internal names, file layout, and how the connector batches metadata reads for `gmail.search`.
- The MIME encoding of a sent mail, within plain text and the headers above.
- The wording of each refusal, and of each tool's description.
- The layout of the tests, and the fake Gmail, Calendar and Drive they use.

## Out of scope

- Drafts, attachments on a send, forwards, and HTML mail.
- Trashing mail, and deleting a Drive file.
- Sharing a Drive file, and changing a shared one:
  [Drive sharing](https://linear.app/zgeoff/issue/GEO-2648).
- PDF and other document text: [document text](https://linear.app/zgeoff/issue/GEO-2649).

## Open questions

- **Is your connected account you?** Connecting could add the account's address as one of your own
  destinations, so a mail or an invitation to it runs without a card. The owner settles it in
  [GEO-2838](https://linear.app/zgeoff/issue/GEO-2838); the recommendation is yes, added at connect
  and removed by Forget. Until then, connecting adds nothing, and a send to the account's own
  address is decided like any other.
