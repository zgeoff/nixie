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

| Call                      | Does                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `begin()`                 | returns the cursor of the host's present state, so a first start reads no older mail                                                                                           |
| `readChanges(cursor)`     | returns the mail after the cursor with a new cursor, `resynced` with every mail when the cursor is not the host's own, or `failed` with the reason and an optional retry delay |
| `send(mail)`              | sends one built message and returns the host's ID for it                                                                                                                       |
| `findSent(messageID)`     | finds a sent mail by the Message-ID header that the send set, or null                                                                                                          |
| `watch(signal)`, optional | yields a hint when mail may have arrived, so the source reads at once                                                                                                          |

A test build serves the one host built so far, which keeps mail in memory. The server starts it when
the config holds a `mail` section, and the harness operation `deliverMail` puts a mail in it. A
release build with a `mail` section refuses to start, and a deployment with no `mail` section starts
with no mailbox, as it does without a coding runner. The `mail` section holds the assistant's
`address` and `host_poll_interval`. The host in memory keeps its mail, its sent mail and its IDs in
a file in the data folder, so a restart of nixie loses none of them, and a cursor from before the
restart still reads only the mail after it.

The mail module never imports the connectors module, which owns the web tools and the code files. It
takes the files of a thread, the link IDs of a session and the stored file of an attachment as ports
in its context, and the server wires each to the connectors module.

## The source

`buildMailSource` returns the trigger source with the ID `mail`. It calls `begin` at its first start
and delivers an empty batch with the cursor, which stores no older mail. It then reads the host each
poll interval, and at once on a hint.

For each new mail, the source parses it and writes it in a write transaction of its own, then
delivers the mail's arrival to the trigger core with the host's new cursor. A crash between the two
delivers the arrival again, and the core drops it by its dedupe key, the host's ID for the mail. A
read that fails, whether the host answers `failed` or throws, backs off from a minute, doubling the
wait up to an hour. A retry time that the host names replaces the backoff. A hint from the host
never ends that wait, so repeated hints cannot keep a failing host busy. The source reports
`unhealthy` after 3 failures in a row.

The source and each send share one lock per host. A send holds it from the host's send to its stored
record and reply rule, so a reply that reaches the host in between is read only once both exist. The
reply joins the sent mail's thread and wakes its sender. A rule that a send sets starts at the send
time, so it matches a reply that came before the rule was written. When the host takes the mail and
then fails, the connector asks the host for the sent mail before it frees the lock, and writes the
record and the rule when the host holds it.

## The stored mail

A mail reaches the log as a `mail.received` record, and a mail the assistant sent as a `mail.sent`
record. The sender, recipients, subject, text and attachment list sit in the record's erasable
fields, so a forget destroys them. The `mail_messages` table keeps what a read needs without the
text: a short ID from `createShortID`, the thread's short ID, the direction, the receive time and
the unread flag.

The mail list pages by the order in which the mailbox stored the mail, which breaks a tie between
mail of one second. The model reads each mail by its short ID, and never by the host's ID. Mail
joins a thread by the Message-ID headers that it answers. The table stores each header as a hash, so
a thread lookup needs no text.

The parser reads UTF-8, Latin-1 and Windows-1252 text, quoted-printable and base64 bodies, encoded
subject words and multipart mail. The sender is the address in angle brackets, so an address inside
a display name never counts. A mail keeps its plain text and its HTML as they came, the HTML cut at
1,000,000 characters, and the module never reads the HTML itself. `mail.list` searches the text and
the source of the HTML. A mail with attachments lists each by name and size. The parser reads a
quoted name that holds a semicolon and an extended name such as `filename*=UTF-8''caf%C3%A9.pdf`,
and keeps each name as its last path segment with no control character.

`mail.read` numbers each link of a plain text as a link ID of the session, such as
`[L1 · example.org/reset]`, and the model opens it with `web_fetch` by that ID. An address that
stands alone on its line is taken whole, with any punctuation at its end, and any other address
loses the punctuation that ends its sentence. The text the model sees never holds the address of a
link, so a link with a token stays out of the model's input until it opens the link. The numbers
belong to the conversation session, or the task run, that reads the mail, and the same address keeps
its number there.

### HTML mail

A mail with an HTML part reads in the fetch sandbox, where `web_fetch` reads a page, whether or not
it also has a plain part, because a link may sit only in the HTML. When the model opens such a mail,
the mail module sends the HTML to the sandbox in the `html` field of a
[fetch request](../connectors/web-fetch.md#the-fetch-sandbox), and the fetch guest answers with the
page reply, whose text holds a mark where each link ends. The module numbers each link in the
session of the call, as `web_fetch` does, and replaces each mark with its link ID. A mail with no
HTML takes its link IDs in the module. When the sandbox fails, `mail.read` gives the plain text of a
mail that has some, and otherwise refuses with `HTML_UNREADABLE` and leaves the mail unread, so the
model can open it again.

## The tools

| Tool                   | Does                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `mail.list`            | pages the mail, newest first, filtered by sender address or `@domain`, text, and unread |
| `mail.read`            | opens one mail by its short ID and marks it read                                        |
| `mail.save_attachment` | keeps one attachment of a received mail as a file of the thread                         |
| `mail.send`            | queues a new mail to up to 20 recipients                                                |
| `mail.reply`           | queues an answer to a mail, in its thread, to its sender                                |
| `mail.wake_set`        | sets a wake rule, and lists the recent mail that it matches                             |
| `mail.wake_list`       | lists every live rule, whoever set it                                                   |
| `mail.wake_cancel`     | ends a rule by its short ID                                                             |

Every field of an incoming mail is content from outside. The model sees each sender, subject and
text of a result fenced as outside text, and the tool result record keeps the plain value with the
source `untrusted`. Each result field a tool returns has a declared source, which the tool registry
checks when the server starts.

Tool errors start with a code: `UNKNOWN_MESSAGE`, `UNKNOWN_ATTACHMENT`, `UNKNOWN_FILE`,
`UNKNOWN_RULE`, `UNKNOWN_TASK`, `BAD_ADDRESS`, `BAD_DURATION`, `TOO_BIG` or `HTML_UNREADABLE`. An
address with a character outside ASCII is a `BAD_ADDRESS`, because the header cannot carry it. A
duration is a number of minutes, hours or days of at most 7 digits, from a minute to 3650 days. The
`wake_rules` durations of the config and the `replyWake` of a send take the same range, and the
config refuses a window past the reply expiry. A call that sets no window takes the default window,
cut to the expiry when the expiry is shorter.

## Attachments

A received mail keeps the bytes of its attachments as attachments of its `mail.received` record,
sealed under the record's key, so a forget of the mail destroys them. A mail keeps its first
attachments up to 25 MiB in all. A later attachment stays in the list without its bytes, and
`mail.save_attachment` refuses it with `TOO_BIG`.

`mail.save_attachment` takes the mail's short ID and the attachment's number from `mail.read`. It
keeps the bytes as a file of the calling thread, the way `computer.export_file` keeps a file, and
returns the file's ID, name, size and media type. The file counts as untrusted, like a download. The
ID works in the `files` argument of a send, in `file.send` and in a code run's inputs, on that
thread only.

`mail.send` and `mail.reply` take `files`, up to 10 file IDs of the calling thread, 25 MiB in all.
The call refuses `UNKNOWN_FILE` for a file that is missing, forgotten or of another thread, and
`TOO_BIG` for more bytes than a mail carries. The approval card lists each file by name and size.
When the send runs, it reads each file's bytes from the thread that queued the action, refuses when
a forget took one, and sends the mail as multipart with each file as an attachment. The `mail.sent`
record keeps each file's name and size.

## Sending

`mail.send` and `mail.reply` are queued tools, so each call runs under the
[decision point](../policy/decision-point.md) and then through the action queue. The send names each
recipient as a destination. The reply names the sender of the mail it answers, and counts that
sender as the reply target only when that mail is one that woke the turn.

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

The approval card of a send shows the reply rule: the length the call names, `off`, or the
deployment's default length when the call names none. The user's approval of the call covers the
rule. A reply rule's origin is `reply`, which `mail.wake_list` shows.

## Wake rules

A rule holds a mailbox, a match, a target and a window, and an optional expiry. The triggers module
stores each in a `trigger.wake_rule_set` record, and the `wake_rules` table folds them.

- **Match.** A rule can hold `from`, a list of addresses or `@domain` entries, `subject`, a
  substring, and `thread`. Each field present must match, with case ignored. A `@domain` entry
  matches that domain and no subdomain. The From header proves nothing about who sent a mail, so a
  match filters and never checks trust.
- **Target.** The rule wakes the conversation, or any task, which the call that sets the rule names.
  A call from a task that names no target wakes that task. A rule whose task ended ends with it.
- **Expiry.** The expiry is optional, so a rule can stay for good, and at most 3650 days. A rule
  matches the mail received before its expiry.
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

The wake flush decides inside the write transaction that writes the wakes, so an arrival that wakes
a rule at the same time cannot let the flush wake it again inside its window. When the task of a
rule has ended, the flush drops the rule's held matches, a cancelled rule's too.

The arrival's erasable fields keep their key while a held match names the arrival. Each arrival sits
in `wake_arrival_cleanup` from its write. The core removes the key of each such arrival that no held
match names, after each batch that holds a mail and at each flush, and then removes the row. A crash
between a commit and the removal leaves the row, so a later flush destroys the sender and subject of
a mail that woke nothing more.

## What is not built

The [mail design](../../design/queue/mail/README.md) covers the rest, and
[the mail issue](https://linear.app/zgeoff/issue/GEO-2816) tracks it.

- A mail host other than the host in memory, so a release build has no mailbox.
- The Gmail mailbox.
