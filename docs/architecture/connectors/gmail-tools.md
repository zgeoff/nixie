# Gmail tools

The Google connector holds 8 `gmail.*` tools. They reach a connected Google account only through the
credential store's fetcher, which adds the credential on the way out, so no tool ever holds a token.
[Google connections](google-connections.md) covers the consent, the scopes and the connection;
[tool calls](tool-calls.md) covers how a call and its errors reach the model. The `mail.*` tools
belong to the assistant's own mailbox.

## The tools

| Tool                    | Effect  | Runs   | Destinations                          | Reconciliation            |
| ----------------------- | ------- | ------ | ------------------------------------- | ------------------------- |
| `gmail.search`          | `read`  | direct | none                                  | none                      |
| `gmail.read`            | `read`  | direct | none                                  | none                      |
| `gmail.read_attachment` | `read`  | direct | none                                  | none                      |
| `gmail.label`           | `write` | queued | none                                  | check `gmail.find_labels` |
| `gmail.draft`           | `write` | queued | none                                  | check `gmail.find_draft`  |
| `gmail.send`            | `send`  | queued | each address in `to`, `cc` and `bcc`  | check `gmail.find_sent`   |
| `gmail.reply`           | `send`  | queued | the recipients it reads, in `prepare` | check `gmail.find_sent`   |
| `gmail.send_draft`      | `send`  | queued | the draft's recipients, in `prepare`  | check `gmail.find_sent`   |

Every Gmail tool needs the scope `gmail.modify`. Each tool is one entry of the connector's
`actions`, so the tool filter that leaves out a tool whose scope is missing, and the notice about
fewer scopes, cover them without a list of their own. The three checks are read-only and run only
from the action queue, so no tool list holds them.

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
- An attempt or a check whose connection is forgotten answers `refused` with `connection_forgotten`.

## Reads

Each read asks Gmail at the time of the call, and nixie keeps no index or cache of mail.

- A text part is at most the `web_fetch` text limit, cut as
  [pages and parts](web-fetch.md#pages-and-parts) sets. `part` names the part, counted from 1, and
  `parts` gives the count. The tool reads the message again for each part.
- A mail with only an HTML part goes to the [fetch sandbox](web-fetch.md#the-fetch-sandbox), which
  opens no connection, so nixie never parses mail HTML on the host and no tracking pixel loads. Each
  link in a body, plain text or HTML, becomes a [link ID](web-fetch.md#link-ids) of the session.
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
  `To`. `gmail.send_draft` reads the draft's recipients.
- **Reply target.** The sender of the message is the reply target of a reply. A reply has no reply
  target when the message sits in Spam or Trash or came from the account itself, and a `Reply-To`
  address that differs from `From` is a destination with no reply target. A sender therefore cannot
  point a reply that runs without asking at someone else. An address the model writes in an argument
  is never a reply target.
- **Decision.** Destinations are bare addresses in lowercase NFC. An exact address can hold act
  trust, and a domain pattern never covers an address, as
  [destinations](../policy/decision-point.md#destinations) sets. The action hash covers the
  destinations and their reply targets.
- **Attempt.** The attempt reads the message or draft again and compares the recipients and the
  reply target. When either differs, such as after the message moved to Spam, it answers
  `destinations_changed`, and the action fails and sends to none. `gmail.send_draft` sends the
  draft's current message with the action's `Message-ID` in place of its own, then deletes the
  draft, and compares recipients only, not the body.
- **Message.** nixie builds the MIME message itself. Its headers are `Date`, `From`, `To`, `Cc`,
  `Bcc`, `Subject`, `Message-ID`, `In-Reply-To` and `References` for a reply, `MIME-Version` and the
  content headers. `Message-ID` is `<action ID@domain of the account>` and the only header that
  names the action. No header names nixie, so a recipient cannot tell that you use an assistant.
- **Errors.** A Gmail 429, or a 403 that names `rateLimitExceeded` or `userRateLimitExceeded`, is
  `refused_retryable` and honours `Retry-After`. A 5xx, a failed network call and an answer with no
  message are `ambiguous`. Any other refusal ends the action.

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
`{to}` lists every destination, `bcc` included.

## Sent-folder check

An attempt that may have sent leaves its outcome unknown. No sooner than the connector's
`trustNegativeAfterMs` after the start of the attempt, the queue runs `gmail.find_sent`, which asks
Gmail 2 ways: a search for `rfc822msgid:` with the action's `Message-ID`, and a list of the `SENT`
label from a short window before the attempt, read to its last page, with the `Message-ID` and
`X-Google-Original-Message-ID` headers of each message. Gmail can replace a `Message-ID` that a
client set and keep the old one in the second header.

| What the check sees                                             | It answers                           |
| --------------------------------------------------------------- | ------------------------------------ |
| Either way finds a message whose header holds the Message-ID    | found; this row wins over the others |
| Both ways finish and find none                                  | not found                            |
| The list holds more than 200 messages                           | inconclusive                         |
| Any call fails, or Gmail answers in a way the check cannot read | inconclusive                         |

Found makes the action done, with the found message and thread as its result. Not found and
inconclusive bring the action to the user on a card, and nothing sends again until the user answers,
as [reconciliation](../core/actions.md#reconciling-an-unknown-outcome) sets. Gmail keeps no other
trace of a sent mail, so a Sent copy deleted for good looks the same as a mail that never went out.

`gmail.find_labels` answers found when each thread holds every label in `add` and none in `remove`,
and inconclusive otherwise. A label change that it finds done answers `created: null`, because the
check cannot tell which labels the action made. `gmail.find_draft` answers found when the account
holds a draft whose `Message-ID` header holds the action's ID.

## Labels and drafts

`gmail.label` takes a capped number of threads of one connection. `add` and `remove` take user label
names and the system labels `INBOX`, `UNREAD`, `STARRED` and `IMPORTANT`. A name in `add` that no
label has makes the label, and a name in `remove` that no label has drops out. A change made twice
has no further effect, so a retry is safe. `gmail.draft` writes a draft in the account and sends
nothing. Both have the effect `write`, so the starter rule `allow-service-writes` covers them. A
rule that asks, or a call that follows outside content, can still hold one on a card.

## Testing

The connector's `test-utils` folder holds a fake Gmail that serves the REST paths the tools use. It
seeds mail, records each request, sends and fails on demand, and `startGmailTools` builds the tools
on it. The test build's fake Google site serves the same fake Gmail on its Gmail paths, with one
mail in the mailbox.
