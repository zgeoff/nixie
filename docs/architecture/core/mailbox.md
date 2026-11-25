# The assistant's mailbox

The assistant has an email address of its own, such as one it signs up to a service with. Mail that
arrives there is stored, and the model reads it with tools. A mail wakes the conversation, or a
task, only when a wake rule matches it, so mail with no matching rule is silent. The mail module
holds the mailbox, its tools, the send and the source that reads the host. The triggers module holds
the wake rules and the arrival path.

Read this doc before you change either module or write a mail host. Read [triggers](./triggers.md)
for the core that takes each arrival, [actions](./actions.md) for the queue that carries each send,
and [erasable fields](./erasable-fields.md) for what a forget destroys.

## The mail host

The mail module reaches a mail system only through the `MailHost` interface, so one module serves
every host.

| Call                      | Does                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `begin()`                 | returns the cursor of the host's present state, so a first start reads no older mail                         |
| `readChanges(cursor)`     | returns the mail after the cursor with a new cursor, or `failed` with the reason and an optional retry delay |
| `send(mail)`              | sends one built message and returns the host's ID for it                                                     |
| `findSent(messageID)`     | finds a sent mail by the Message-ID header that the send set, or null                                        |
| `watch(signal)`, optional | yields a hint when mail may have arrived, so the source reads at once                                        |

A test build serves the one host built so far, which keeps mail in memory. The server starts it when
the config holds a `mail` section, and the harness operation `deliverMail` puts a mail in it. A
release build with a `mail` section refuses to start, and a deployment with no `mail` section starts
with no mailbox, as it does without a coding runner. The `mail` section holds the assistant's
`address` and `host_poll_interval`.

## The source

`buildMailSource` returns the trigger source with the ID `mail`. It calls `begin` at its first start
and delivers an empty batch with the cursor, which stores no older mail. It then reads the host each
poll interval, and at once on a hint.

For each new mail, the source parses it and writes it in a write transaction of its own, then
delivers the mail's arrival to the trigger core with the host's new cursor. A crash between the two
delivers the arrival again, and the core drops it by its dedupe key, the host's ID for the mail. A
read that fails backs off, doubling the wait up to a cap, and the source reports `unhealthy` after 3
failures in a row.

## The stored mail

A mail reaches the log as a `mail.received` record, and a mail the assistant sent as a `mail.sent`
record. The sender, recipients, subject, text and attachment list sit in the record's erasable
fields, so a forget destroys them. The `mail_messages` table keeps what a read needs without the
text: a short ID from `createShortID`, the thread's short ID, the direction, the receive time and
the unread flag.

The model reads each mail by its short ID, and never by the host's ID. Mail joins a thread by the
Message-ID headers that it answers. The table stores each header as a hash, so a thread lookup needs
no text.

The parser reads UTF-8, Latin-1 and Windows-1252 text, quoted-printable and base64 bodies, encoded
subject words and multipart mail. It prefers the plain part. For an HTML part it drops scripts and
styles and shows each link as its label followed by the address in parentheses, so a reset link
stays readable. A mail with attachments lists each by name and size.

## The tools

| Tool               | Does                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| `mail.list`        | pages the mail, newest first, filtered by sender address or `@domain`, text, and unread |
| `mail.read`        | opens one mail by its short ID and marks it read                                        |
| `mail.send`        | queues a new mail to up to 20 recipients                                                |
| `mail.reply`       | queues an answer to a mail, in its thread, to its sender                                |
| `mail.wake_set`    | sets a wake rule, and lists the recent mail that it matches                             |
| `mail.wake_list`   | lists every live rule, whoever set it                                                   |
| `mail.wake_cancel` | ends a rule by its short ID                                                             |

Every field of an incoming mail is content from outside, so a result that holds a sender, a subject
or a text carries the source `untrusted`, and the tool result record keeps it. Each result field a
tool returns has a declared source, which the tool registry checks when the server starts.

Tool errors start with a code: `UNKNOWN_MESSAGE`, `UNKNOWN_RULE`, `UNKNOWN_TASK`, `BAD_ADDRESS` or
`BAD_DURATION`.

## Sending

`mail.send` and `mail.reply` are queued tools, so each call runs under the
[decision point](../policy/decision-point.md) and then through the action queue. The send names each
recipient as a destination. The reply names the sender of the mail it answers, as the reply target.

The Message-ID of a send is the action's ID at the assistant's domain, so a retry builds the same
message. The connector sends the mail and writes the `mail.sent` record. Its reconcile check asks
the host with `findSent`, and writes the same record when the host holds the mail. Both writes are
idempotent on the host's ID for the sent mail, so a mail that went out and lost its outcome still
gets its record and its reply rule.

### The reply rule

A send sets a reply rule in the same transaction as its `mail.sent` record. The rule matches the
sent mail's thread and wakes the caller that queued the send, the conversation or a task. It expires
after the `replyWake` argument of the call, such as `2d`, or after the deployment's
`wake_rules.reply_expiry`. The value `off` sets no rule.

`replyWake` is one of the call's arguments, so the approval card shows it with the others, and the
user's approval of the call covers the rule. A reply rule's origin is `reply`, which
`mail.wake_list` shows.

## Wake rules

A rule holds a mailbox, a match, a target and a window, and an optional expiry. The triggers module
stores each in a `trigger.wake_rule_set` record, and the `wake_rules` table folds them.

- **Match.** A rule can hold `from`, a list of addresses or `@domain` entries, `subject`, a
  substring, and `thread`. Each field present must match, with case ignored. A `@domain` entry
  matches that domain and no subdomain. The From header proves nothing about who sent a mail, so a
  match filters and never checks trust.
- **Target.** The rule wakes the conversation, or any task, which the call that sets the rule names.
  A call from a task that names no target wakes that task. A rule whose task ended ends with it.
- **Expiry.** The expiry is optional with no cap, so a rule can stay for good. A rule matches the
  mail received before its expiry.
- **Window.** The window is the shortest time between two wakes by one rule. The deployment's
  `wake_rules.window` sets the default, and a call sets a window of a minute at least. Each rule
  keeps its own window, and no limit holds for the mailbox as a whole.
- **Replace.** A rule with the match and target of a live rule replaces it and keeps its ID.

Mail is silent by default. A mail that no rule matches writes no record in the triggers module.

## The arrival path

The trigger core takes a mail arrival in the same write transaction as the rest of a batch, and
drops it when the dedupe key is held. Then it reads the live rules and matches the mail:

1. With no match, the core writes nothing.
2. With a match, it writes one `trigger.mail_arrived` record. Its sender and subject are erasable.
3. A rule that never woke, or whose last wake is a window ago or more, is ready. For each target
   that has a ready rule, the core writes one `trigger.mail_woke` record to the target's inbox,
   which wakes it. The record names the rules, and the mails of every held match too.
4. A match that no ready rule takes is held in `wake_held`. The wake flush runs on a short interval
   and wakes the target of each held match whose rule is ready, with the held mail in one record.

`trigger.mail_woke` renders for the model as the rules that matched, a mail count, and each sender
and subject as outside content, with the mail's short ID. A mail forgotten since shows as forgotten.
The model then opens a mail with `mail.read`.

The arrival's erasable fields keep their key while a held match names the arrival. Once none does,
the core removes the key after the commit, so the sender and subject of a mail that woke nothing
more are destroyed. A crash between the commit and the removal leaves the key in place until a later
forget.

## What is not built

The [mail design](../../design/queue/mail/README.md) covers the rest, and
[the mail issue](https://linear.app/zgeoff/issue/GEO-2816) tracks it.

- A mail host other than the host in memory, so a release build has no mailbox.
- The `mail.save_attachment` tool and a `files` argument on a send. A mail lists each attachment by
  name and size and holds no attachment.
- The fetch sandbox's parse of an HTML mail, and the link IDs that the
  [web fetch](../connectors/web-fetch.md) tools open. A link stays an address in the text.
- The Gmail mailbox.
