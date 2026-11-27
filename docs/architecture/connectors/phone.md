# The assistant's phone

The assistant has a mobile number of its own that takes texts. Each text that arrives is stored, and
the model reads it with tools. A text wakes the conversation, or a task, only when a wake rule
matches it, so a text with no matching rule is silent. The phone module holds the provider
interface, the tools, the source that polls the provider and the send. The triggers module holds the
wake rules and the arrival path, and `adapters/phone-twilio` is the one provider.

Read this doc before you change the phone module or write another provider. Read
[the mailbox](../core/mailbox.md) for the wake rules that mail shares with the phone, and
[triggers](../core/triggers.md) for the core that takes each arrival.

The phone is an optional feature. With no `phone` section in the deployment config, nixie offers no
phone tools, polls nothing and accepts no wake rule on a phone. The `phone` feature ID,
`listFeaturesOn` and the part declaration follow
[feature switches](../deployment/server.md#feature-switches).

## The provider

The phone module reaches a phone service only through the `PhoneProvider` interface.

| Call                 | Does                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `readRecent()`       | returns every text the number received at its newest time, so a first start knows the state |
| `readInbound(since)` | returns every text the number received at or after the time, oldest first, across all pages |
| `send(request)`      | sends one text and returns the provider's ID for it, or `refused` when it took none         |
| `readSentTexts(q)`   | returns the texts the number sent to one number with one body in a window, and never sends  |

Each text holds the provider's receive time and how coarse its clock is, in milliseconds. A read
that cannot reach every text it needs, such as one page that fails in a long backlog, throws, so the
source never moves its cursor past a text it did not read.

A call that fails to reach the provider throws, and a send that throws has an unknown outcome.
Twilio stamps a text to the second, and nixie takes the time Twilio created the text as its receive
time, so a rule that the model set after the text arrived cannot take it. Twilio sorts its list by
the sent time, which a late text puts long before its creation time. So a read of the texts takes
every page from a day before its start time, and a text that Twilio created more than a day after it
was sent is out of reach. Twilio lists a queued text with no sent time, so a read for a send looks
at the creation time and pages through the list without a filter on the sent time.

The adapter calls the provider's Messages API through the credential store's fetcher, bound to the
provider's API origin. The fetcher adds the API key as HTTP Basic, with the key's SID as the user,
so the adapter never holds the secret. A send answered with a 4xx other than a rate limit is
`refused`. A network failure, a rate limit and a 5xx throw, because the text may have gone out. A
test build with a harness serves an in-memory provider in its place, so no test or journey reaches
the real one, and the harness operation `deliverText` puts a text in it.

## The source

`buildPhoneSource` returns the trigger source with the ID `phone`. The server adds that ID to the
triggers module's list of text sources before any part starts. The source reads the provider each
`poll_interval`, so nixie needs no address that the internet can reach.

- At its first start the source records where the provider stands and writes nothing for the texts
  it holds, so a new deployment never wakes on old texts.
- For each text past the cursor the source writes a `phone.text_received` record in a write
  transaction of its own, then delivers the arrival with the new cursor. A crash between the two
  delivers the arrival again, and the core drops it by its dedupe key, the provider's message ID.
- After an outage the source stores each text it missed, and delivers an arrival only for the texts
  received in the last hour, so a wake rule never fires on a text a day old.
- A read that fails backs off from a minute, doubling up to an hour, and the source reports
  `unhealthy` after 3 failures in a row.

The cursor holds the newest receive time and the message IDs that share it, so two texts in the same
second are neither lost nor read twice. At its first start the source records every text of the
newest time, however many pages they fill. The arrival that the source delivers holds the text's
fields, and the core replaces them with the ones the phone's store holds when it writes the arrival,
so a text forgotten between the store and the arrival wakes nothing.

## The stored text

| Name                  | Holds                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `phone.text_received` | one record per new text; `from` and `body` are erasable                   |
| `phone_texts`         | a projection from a short ID to the record and the provider's message ID  |
| `phone.send_claimed`  | one record per send that settled on a provider message, holding IDs alone |
| `phone_send_claims`   | a projection from an action ID to the message ID it settled on            |

The model reads and passes the short ID of a text, never its record's UUID.

## The tools

| Tool                                          | Effect | Runs   | Destination |
| --------------------------------------------- | ------ | ------ | ----------- |
| `phone.list`, `phone.read`, `phone.wake_list` | `read` | direct | none        |
| `phone.wake_set`, `phone.wake_cancel`         | `note` | direct | none        |
| `phone.forget`                                | `note` | direct | none        |
| `phone.send`                                  | `send` | queued | the number  |

`phone.list` returns the texts newest first with the assistant's own number, optionally from one
sender, and pages with `next`. `phone.read` opens one text by its short ID. Every field of a text
comes back marked as outside content, and a call's record keeps the IDs and times of the texts it
read, never their sender or body, so a forget leaves no readable copy there. The record of a call to
`phone.list` or `phone.wake_set` also leaves out the sender and body that its arguments name.

`phone.forget` takes a text's short ID and starts the forget below. The text hides at once, and the
rest of the erasure finishes after the calling step ends.

`phone.wake_set`, `phone.wake_list` and `phone.wake_cancel` take the arguments and give the results
of the mail tools, on the mailbox `{ kind: 'source', sourceID: 'phone' }`, with `body` in place of
`subject`. A rule matches `from` as a number in E.164 form, or as a sender name without case, and
`body` as a substring of the text, both sides in NFC and lowercase. A `from` entry takes the whole
sender and never a part of it. Anyone can send a text under any sender name, so a name proves
nothing about who sent it.

`phone.send` refuses a number that is not in E.164 form (`BAD_NUMBER`) and a body over 640
characters (`TOO_LONG`). `phone.read` refuses an unknown ID (`UNKNOWN_TEXT`). The always-allow rule
of `phone.send` pins the number, so an approval for one number never covers another.

A sign-up that asks for a phone number gets the number that `phone.list` returns. The model sets a
wake rule, reads the text that wakes it and types the code into the page. With the phone off, the
model has no phone tool, and `computer.handover` hands the step to the user.

## The send

The queue runs `phone.send` through the phone connector. A send the provider accepts claims the
message it returns, and its outcome holds the text's short ID and the action's ID. A send that holds
a claim sends nothing again, and its check answers from the claim before it reads the provider. A
refusal ends the action with `SEND_FAILED`.

A send of unknown outcome reconciles with a read-only check. The connector looks for texts to the
same number with the same body, created from a minute before the attempt began, to allow for the
provider's clock. In one write transaction the check reads the claims and the other open sends. It
settles as found only when exactly one such text has no row in `phone_send_claims`, the provider
stamps it at or after the attempt began, and no other open send carries the same number and body. It
then claims that text in the same transaction. When the check finds no text, finds more than one,
finds one from before the attempt, or cannot read the provider, the queue asks the user, because a
match cannot show which send made the message.

## Forgetting a text

A forget of a text runs through the erasure runner as the `text` kind, which the core log lists as a
text and not as the phone. It captures the text's record, its arrival and every wake that showed it,
then removes their keys, so no readable copy stays. The cleanup covers the sessions and the turn
inputs that saw a wake. A forget erases nixie's copy and leaves the text at the provider. The server
registers the kind whether or not the phone is on, because a forget that a crash cut short finishes
at the next start from the log alone.

The core asks the phone's store for a text's fields when the flush writes a wake. The store holds
none once the forget has begun, so a wake that the flush writes after that leaves the text out.

## Configuration

```yaml
phone:
  number: '+61411111111' # the assistant's own number, in E.164 form
  poll_interval: 20s
  twilio: # the adapter's section, which the phone module never reads
    account_sid: AC00000000000000000000000000000000
    api_key_sid: SK00000000000000000000000000000000
    credential: deployment:phone # the API key's secret
    api_url: https://api.twilio.com
```

The number takes texts only. The provider's settings refuse calls, and nixie places none.

## Tests

The module's tests run against the in-memory provider, which can fail a send in 3 ways: refused,
thrown before the text exists, and thrown after. The adapter's tests run against a mock of the
Messages API on a reserved `.test` host. No test sends a real text.
