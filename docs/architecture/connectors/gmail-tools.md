# Gmail tools

The Google connector holds 11 `gmail.*` tools. They reach a connected Google account only through
the credential store's fetcher, which adds the credential on the way out, so no tool ever holds a
token. For the consent, the scopes and the connection, see
[Google connections](google-connections.md); for how a call and its errors reach the model, see
[tool calls](tool-calls.md). The `mail.*` tools belong to the assistant's own mailbox.

## The tools

| Tool                    | Effect              | Runs   | Destinations                          | Reconciliation            |
| ----------------------- | ------------------- | ------ | ------------------------------------- | ------------------------- |
| `gmail.search`          | `read`              | direct | none                                  | none                      |
| `gmail.read`            | `read`              | direct | none                                  | none                      |
| `gmail.read_attachment` | `read`              | direct | none                                  | none                      |
| `gmail.label`           | `write`             | queued | none                                  | check `gmail.find_labels` |
| `gmail.draft`           | `write`             | queued | none                                  | check `gmail.find_draft`  |
| `gmail.send`            | `send`              | queued | each address in `to`, `cc` and `bcc`  | check `gmail.find_sent`   |
| `gmail.reply`           | `send`              | queued | the recipients it reads, in `prepare` | check `gmail.find_sent`   |
| `gmail.send_draft`      | `send`              | queued | the draft's recipients, in `prepare`  | check `gmail.find_sent`   |
| `gmail.wake_set`        | `schedule`, `write` | queued | none                                  | none                      |
| `gmail.wake_list`       | `read`              | direct | none                                  | none                      |
| `gmail.wake_cancel`     | `note`              | direct | none                                  | none                      |

Every Gmail tool needs the scope `gmail.modify`. Each tool is one entry of the connector's
`actions`, so the tool filter and the notice about fewer scopes cover them with no list of their
own. The filter leaves out a tool whose scope is missing. The three checks are read-only and run
only from the action queue, so no tool list holds them.

The server builds the tools in the `google_tools` part, which needs only its inputs. The tool list
and the action queue hold the tools before the connections and the fetch sandbox start, so the part
binds the live connections, the log, the clock and the sandbox's HTML reader when each starts. A
call before then finds no connection, and a mail's HTML reads as unsupported.

## Items and connections

- Every message, thread and draft ID a tool returns is the connection's short ID, a dot and Google's
  ID, such as `k3x9m2p7qa.18c2f0a9b4d1e7c3`, and the model passes it back whole. An attachment ID is
  a MIME part ID within its message and carries no prefix.
- A tool's `resolveInput` runs before anything else reads a call. It takes the connection from the
  prefix of the item IDs, from the `connection` argument, or from the only live Google connection,
  and writes it into the input. A queued action's arguments therefore always name its connection. A
  call that names items of 2 connections fails with `mixed_connections`, and a call with no
  connection to choose fails with `CONNECTION_REQUIRED`.
- A job's pins and the model's status line are not built. A tool resolves a call against every live
  Google connection, whatever job run the call belongs to.
- An attempt whose connection is forgotten answers `refused` with `connection_forgotten`. A check
  whose connection is forgotten answers inconclusive.

## Reads

Each read asks Gmail at the time of the call, and nixie keeps no index or cache of mail.

- A text part is at most the `web_fetch` text limit, cut as
  [pages and parts](web-fetch.md#pages-and-parts) sets. The model picks a part with `part`, counted
  from 1, and reads the count in `parts`. The tool reads the message again for each part.
- A mail with only an HTML part goes to the [fetch sandbox](web-fetch.md#the-fetch-sandbox), so
  nixie never parses mail HTML on the host. The sandbox opens no connection, so no tracking pixel
  loads. Each link in a body, plain text or HTML, becomes a [link ID](web-fetch.md#link-ids) of the
  session.
- `gmail.read_attachment` reads `text/*` and `application/json` as UTF-8 text in parts and an image
  as [web fetch images](web-fetch-images.md) does. Every other type answers `unsupported`, and a
  file over the reader's size limit answers `too_large`. The reader is a shared function, so Drive
  reads files the same way.
- A result field that holds a mail's words is of source `untrusted`. The tool wraps each such value
  as outside content, and the call's record keeps the plain text under its own key, so a forget of
  the record removes it. `gmail.read` and `gmail.search` wrap the sender, recipients, subject,
  snippet and body, and an attachment's name and type.

## Sends

`gmail.send`, `gmail.reply` and `gmail.send_draft` read what the decision needs in `prepare`, before
the decision point, and the action queue runs the attempt after the decision.

- **Recipients.** `gmail.send` takes a capped number of addresses across `to`, `cc` and `bcc`, a
  text body, an optional HTML body and a capped number of files, as its input schema sets. A file is
  one of the assistant's own files on the thread. `gmail.reply` takes its recipients from the
  message, never from the model: `Reply-To`, else `From`, and with `replyAll` the message's `To` and
  `Cc` too, without the account's own address. A reply to the account's own message goes to its
  `To`. `gmail.send_draft` reads the draft's recipients. A header that holds an address group, such
  as `Team: a@example.org, b@example.org;`, counts each member as a recipient.
- **Reply target.** The sender of the message is the reply target of a reply. A reply has no reply
  target when the message sits in Spam or Trash or came from the account itself, and a `Reply-To`
  address that differs from `From` is a destination with no reply target. A sender therefore cannot
  point a reply that runs without asking at someone else. An address the model writes in an argument
  is never a reply target.
- **Decision.** Destinations are bare addresses in lowercase NFC. An exact address can hold act
  trust, and a domain pattern never covers an address, as
  [destinations](../policy/decision-point.md#destinations) sets. The action hash covers the
  destinations and their reply targets. The address of each live Google connection is one of your
  own, so a mail to it needs no card, and forgetting the connection takes that address away.
- **Attempt.** The attempt reads the message or draft again and compares the recipients and the
  reply target. When either differs, such as after the message moved to Spam, it answers
  `destinations_changed`, and the action fails and sends to none. Before the decision,
  `gmail.send_draft` adds a `digest` of the draft's whole raw message to the call's arguments, so
  the decision, the action hash and the queued action cover its recipients, subject, body and files.
  The attempt reads the draft again, and when its digest differs it refuses and sends nothing.
  Otherwise it sends the draft's message with the action's `Message-ID` in place of its own, then
  deletes the draft.
- **Message.** nixie builds the MIME message itself. Its headers are `Date`, `From`, `To`, `Cc`,
  `Bcc`, `Subject`, `Message-ID`, `In-Reply-To` and `References` for a reply, `MIME-Version` and the
  content headers. `Message-ID` is `<action ID@domain of the account>` and the only header that
  names the action. No header names nixie, so a recipient cannot tell that you use an assistant.
- **Errors.** A Gmail 429, or a 403 that names `rateLimitExceeded` or `userRateLimitExceeded`, is
  `refused_retryable` and honours `Retry-After`. A 5xx with any body, a failed network call and an
  answer with no message are `ambiguous`, so a send that Gmail may have taken never repeats on its
  own. Any other refusal ends the action.

### The card

`prepare` seals the facts of the card as an attachment of the call's own record, so a forget of the
record takes them and a card still renders while the connection is down. The card's body fields come
from `readGmailBodyFields`, which the API chains with the other tools' fields. A send whose
attachment is gone reads as unreadable and shows no body.

| Tool               | Sentence                                          | Approve button |
| ------------------ | ------------------------------------------------- | -------------- |
| `gmail.send`       | Send an email from {from} to {to}: "{subject}"    | Send email     |
| `gmail.reply`      | Reply to {replyTo} from {from}: "{subject}"       | Send reply     |
| `gmail.send_draft` | Send a draft from {from} to {to}: "{subject}"     | Send email     |
| `gmail.label`      | Label {count} threads: add {add}, remove {remove} | Label          |

A mail card shows the account it leaves from, each recipient, the subject, the message answered
(`gmail.reply`), the whole text body and each file by name and size. It leaves out an empty field.
`{to}` lists every destination, `bcc` included. Each recipient in `to`, `cc` and `bcc` stands beside
the permission that the decision gave it, such as `sam@example.org (reply target)`, and one that no
permission covered reads `kirk@example.org (no permission)`. `readGmailBodyFields` reads those
permissions from the call's own record when the card is read.

## Sent-folder check

An attempt that may have sent leaves its outcome unknown. No sooner than the connector's
`trustNegativeAfterMs` after the start of the attempt, the queue runs `gmail.find_sent`. It searches
Gmail for `rfc822msgid:` with the action's `Message-ID`, and it lists the `SENT` label from a short
window before the attempt, read to its last page, with the `Message-ID` and
`X-Google-Original-Message-ID` headers of each message. Gmail can replace a `Message-ID` that a
client set and keep the old one in `X-Google-Original-Message-ID`.

| What the check sees                                             | It answers                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Either way finds a message whose header holds the Message-ID    | found, and wins over the rows below; inconclusive when the send's reply rule cannot be written |
| Both ways finish and find none                                  | not found                                                                                      |
| The list holds more than 200 messages                           | inconclusive                                                                                   |
| Any call fails, or Gmail answers in a way the check cannot read | inconclusive                                                                                   |
| A listed message is gone when the check reads it                | inconclusive                                                                                   |

Found makes the action done, with the found message and thread as its result. Not found and
inconclusive bring the action to the user on a card, and nothing sends again until the user answers,
as [reconciliation](../core/actions.md#reconciling-an-unknown-outcome) sets. Gmail keeps no other
trace of a sent mail, so a Sent copy deleted for good looks the same as a mail that never went out.

A label change applies to every message of a thread, so `gmail.find_labels` answers found only when
every message of each thread holds every label in `add` and none in `remove`, and inconclusive
otherwise. For a label change that it finds done, it answers `created: null`, because the check
cannot tell which labels the action made. `gmail.find_draft` answers found when the account holds a
draft whose `Message-ID` header holds the action's ID.

## Labels and drafts

`gmail.label` takes a capped number of threads of one connection. `add` and `remove` take user label
names and the system labels `INBOX`, `UNREAD`, `STARRED` and `IMPORTANT`. A name in `add` that no
label has makes the label, and a name in `remove` that no label has drops out. A change made twice
has no further effect, so a retry is safe. `gmail.draft` writes a draft in the account and sends
nothing. Both have the effect `write`, so the starter rule `allow-service-writes` covers them. A
rule that asks, or a call that follows outside content, can still hold one on a card.

## Arrivals

The `gmail_source` part starts the Gmail arrival source on the trigger core, with the Google hosts
of the `google_tools` part. The source has the id `gmail` and the kind `mail`. It polls each Google
connection that holds `gmail.modify` and is not waiting for a new consent, one at a time, every
`google.gmail.poll_interval` (default `2m`). It reads Gmail and never reaches the decision point.

- The first poll of a connection reads the profile's history ID and delivers no mail.
- Each later poll reads `history.list` from the stored history ID, over every page, for added
  messages. It reads each one in `metadata` format and drops a message labelled `SENT`, `DRAFT`,
  `SPAM` or `TRASH`. It reads every new message whether or not a rule is live, so a rule set during
  a poll misses nothing. The trigger core drops each arrival that no rule matches.
- A poll is one `deliver` call, with its arrivals and the cursor of every connection. The cursor
  moves only when the call commits. Because each poll writes the poll time into the cursor, each
  poll leaves a `trigger.delivered` record, even with no mail.
- When Google answers 404 for the stored history ID, the source reads the profile's history ID, and
  only then lists the mail that arrived since a margin before the last good poll. The margin is
  `lookbackMs` in
  [`read-gmail-changes.ts`](../../../modules/google/src/gmail/poll/read-gmail-changes.ts). A mail
  that arrives between the two reads is in the list or after the new cursor. The dedupe keys drop
  each mail already recorded.
- The source rereads the mail since each reply rule's send, so a rule still wakes on a reply that
  arrived, and was dropped, before the rule existed. Each poll reads the connection's live reply
  rules from the log and takes those whose IDs are not yet in `replayed` in the connection's cursor
  entry. As a resync does, it lists the mail since the earliest start among them. The delivery that
  commits adds the rule IDs to `replayed`. The rules live in the log and `replayed` in the cursor,
  so a restart between setting the rule and the next poll loses nothing.
- A failed poll keeps the cursor. The source polls again after a backoff, or after Google's retry
  time when that is longer. The backoff doubles after each further failure up to a cap, and both
  live in [`build-poll-retry-ms.ts`](../../../modules/google/src/gmail/poll/build-poll-retry-ms.ts).
  After 3 failed polls in a row of any polled connection it reports `unhealthy`, and it reports
  `running` once the last poll of every polled connection succeeded. A connection that needs a new
  consent is skipped and counts for neither. The loop never sleeps past
  `google.gmail.poll_interval`, so a connection that joins the list gets its first poll within an
  interval while another backs off.
- A stop aborts each request in flight through the connection's context, so a shutdown never waits
  on Gmail, and an aborted poll doesn't count as a failure.
- A mail's arrival ID is the connection's short ID, a dot and Google's message ID, as in the tools.
  Its mailbox is `gmail:<connection ID>`, so a rule on one connection never matches another's mail.
- At its next delivery, the source drops the cursor entry of each connection that is no longer live.

### Wake rules

`gmail.wake_set`, `gmail.wake_list` and `gmail.wake_cancel` take the same match, target, `expires`
and `window` as [the mailbox's wake tools](../core/mailbox.md#wake-rules), with Gmail's thread ID in
`thread`. A thread ID with the connection's prefix names the connection.

- `gmail.wake_set` declares the effects `schedule` and `write`. An allow rule covers a call only
  when it lists every effect of the call. No starter rule lists `schedule`, so a call asks the user
  until the user adds an allow rule that lists both effects. The `write` effect queues the call, so
  it runs as an action even under an allow rule. The rule starts when the action runs, and the
  action fails with `TASK_ENDED` when the target task has ended by then. The tool answers
  `BAD_DURATION` for a duration under a minute, and sets no upper limit. It answers `NOT_POLLED` for
  a connection that the poll skips, one that lacks `gmail.modify` or needs a new consent, because a
  rule there would never fire.
- Each rule write checks, in its own write transaction, that the connection is still live. A call
  that read the connection before a forget refuses once the forget lands, so no rule outlives the
  forget.
- `gmail.wake_list` lists every live rule of the connection, and `gmail.wake_cancel` answers
  `UNKNOWN_RULE` for a rule of another mailbox. Neither asks.
- `gmail.send` and `gmail.reply` take `replyWake`, as `mail.send` does: a duration, or `off`. When
  the send is done, nixie sets a rule on the sent mail's Gmail thread that wakes the caller that
  queued the send, from the start of the send, for `replyWake` (default `wake_rules.reply_expiry`).
  A send that `gmail.find_sent` later finds gets the same rule, unless the rule's expiry has passed
  by then. The result holds the rule's short ID as `replyRule`, or null. The send's card shows the
  expiry. A send whose rule cannot be written answers `ambiguous`, so the check finds the mail and
  writes the rule again. A check that finds the mail but cannot write its rule answers
  `inconclusive`, so the queue never settles a send without its rule. nixie writes the rule in its
  own transaction, before the action's outcome, because the action queue runs no connector write
  inside the outcome's transaction. A restart between the two leaves the action unsettled, and the
  same check replaces the rule in place, so one rule stays. A send that the user drops after such a
  restart keeps its rule. The owner decides in [GEO-2871](https://linear.app/zgeoff/issue/GEO-2871)
  whether it should.

### Forgetting

Forgetting a connection calls the trigger module's `eraseGmailMailbox` twice, once when the
connection is hidden and once when its indexes clean. Each call ends the connection's rules as
`connection_forgotten`, drops the matches they held, and destroys the sender and subject of every
arrival and wake of that mailbox. A wake keeps its record, which renders each mail as forgotten. The
forget also finds the wakes that show the connection's mail. It cleans the sessions on each wake's
thread, as a forgotten record does, and removes every logged request on those threads, so no sender
or subject outlives the forget in a session or in a turn input.

## Testing

The connector's `test-utils` folder holds a fake Gmail that serves the REST paths the tools use. It
seeds mail, records each request, and sends or fails on demand. `startGmailTools` builds the tools
on a loopback HTTPS site of it, whose certificate the tools' fetcher trusts. The test build's fake
Google site serves the same fake Gmail on its Gmail paths over HTTPS, with one mail in the mailbox.
