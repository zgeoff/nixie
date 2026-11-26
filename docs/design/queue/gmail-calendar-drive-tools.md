# Google tools

- **Status:** agreed
- **Work items:** [Calendar and Drive](https://linear.app/zgeoff/issue/GEO-1826), which builds on
  the [Google connection](google-connections.md) and the built
  [Gmail tools](../../architecture/connectors/gmail-tools.md).

nixie reads, searches and labels your Gmail, sends mail, and reads and changes your calendar and the
Drive files you give it, through one Google connection. Every read asks Google live, inside the
model's turn: nixie syncs nothing. The only copies of your mail, events or files it keeps are in a
call's own records: the text the call returned, and the card fields its `prepare` read. A change or
a send runs as an [action](../../architecture/core/actions.md), and the
[decision point](../../architecture/policy/decision-point.md) decides it before every attempt from
the effects the tool declares and the destinations nixie reads from Google. When an attempt's
outcome is unknown, a read-only check at Google settles it, and nixie never repeats a send blind.

Below are the rules for every Google tool, and the parts of the Gmail tools not built yet. The
[Calendar and Drive tools](../../architecture/connectors/calendar-drive-tools.md) are built. The
Gmail tools are `gmail.*`. The `mail.*` tools belong to the assistant's own mailbox, in the
[mail design](https://github.com/zgeoff/nixie/pull/1420). That design also defines `gmail.wake_set`,
`gmail.wake_list` and `gmail.wake_cancel`, and the `replyWake` argument of `gmail.send` and
`gmail.reply`. The mail polls work item builds them. The tokens, the consent and the scopes belong
to the [Google connection](google-connections.md). For how a call and its errors reach the model,
see [tool calls](../../architecture/connectors/tool-calls.md).

## Shape

```mermaid
flowchart LR
  model[model] -->|"a Google tool"| endpoint[tool endpoint]
  endpoint -->|"1. prepare: read the item"| gmail[Google API]
  endpoint -->|"2. decide"| dp[decision point]
  dp -->|ask| card[send card]
  card -->|approve| queue[action queue]
  dp -->|allow| queue
  queue -->|"3. the change"| gmail
  queue -->|"4. unknown: check"| sent[read-only check]
```

## Contracts

### Every Google tool

The connector's `actions`, the tool endpoint's `resolveInput` and `prepare`, the reply targets, and
the item and connection IDs are built; see the
[Gmail tools](../../architecture/connectors/gmail-tools.md) doc. Build each Calendar or Drive tool
on the same shapes:

- Every event and file ID a Google tool returns starts with its connection's short ID and a dot.
  When a tool takes an item ID, resolve its connection from that prefix. Give every other tool the
  connection argument when its caller can reach 2 or more Google connections.
- Give each tool an `EffectDeclaration` whose effects never depend on its arguments or on the item
  it acts on. When a tool's destinations or card fields come from an item at Google, read them in
  `prepare`, before the decision point, and seal the card's facts as an attachment of the call's
  record.
- Each destination is a bare address, with no display name, in lowercase NFC. A reply target covers
  only the reply or response whose `prepare` returned that address, and an address the model writes
  in an argument is never a reply target.
- Make the connector read the item again in its attempt. When the guests or a reply target differ,
  it returns `destinations_changed`, and the action fails and sends to none of them.

Each result field has a source: `untrusted` is outside content, and `owner_data` is your own data. A
field that holds a list or an object takes the least trusted source of its members, so `messages`
and `events` are `untrusted`. An endorsed field has a type that cannot carry words: a boolean, a
number, a time or a value from a fixed list. The field's output schema carries `x-endorsed`, and
endorsement leaves its source unchanged. No decision reads endorsement yet; a later taint stage
will.

### Not built yet

These parts of the Gmail tools are not built yet:

- The connection argument's job pins and the model's status line, set out in the connector design
  and in
  [serving nixie's tools](../platform/connectors/tools.md#what-the-model-learns-about-a-connection).
- You can edit the subject and the text body on a mail card before you approve it. nixie sends
  exactly what you approved, and the result's `edited` field holds the final subject and text for
  the model, or `null`. When you edit the text body of a mail that has an HTML body, nixie drops the
  HTML body.
- A mail card shows an HTML body rendered in a sandboxed frame that runs no script and loads nothing
  remote.

## Constraints

### Checks

- Found wins over every other answer. A check never answers not found while any read it makes fails.
  An answer that no found or not-found row names is inconclusive, including a response or a label
  that differs, because a later change can have replaced it.
- An inconclusive answer brings the action to you, as
  [reconciliation](../../architecture/core/actions.md#reconciling-an-unknown-outcome) sets.

### The read path

- Every read calls Google at the time of the call. nixie keeps no index or cache of mail, events or
  files.
- The text the model read sits in the call's `tool_result` record under that record's own key, so
  forgetting the record removes it.
- Every send, a draft's send included, passes the decision point. The starter rule
  `allow-sends-within-limits` ([rules](../platform/policy/rules.md)) allows a send, and the send
  runs at once only when each destination has a permission at stage 5 or your consent. Every other
  send waits on its card.

## Decisions

- **The Google tools are `gmail.*`, `calendar.*` and `drive.*`, with the names in
  [the Gmail tools](../../architecture/connectors/gmail-tools.md#the-tools) and
  [Calendar and Drive tools](../../architecture/connectors/calendar-drive-tools.md#the-tools).** Use
  `mail.*` only for the assistant's own mailbox.
- **The card sentences and approve buttons are those in the
  [Gmail card table](../../architecture/connectors/gmail-tools.md#the-card).**
- **Reads are live.** With no store, nixie has no sync to keep and no new forget path.
- **Each item ID carries its connection.** nixie keeps no copy of mail to map a Gmail ID back to an
  account, and the reply leaves from the account that received the message.
- **nixie puts the action ID only in the `Message-ID` header.** The check needs one header, and a
  header that names nixie would tell each recipient you use an assistant.
- **A mail the Sent-folder check does not find comes to you, and nixie never resends it on its
  own.** A duplicate mail to someone outside is worse than asking you once.
- **Recipients and guests come from Google, never from the model's text.**

## Builder decides

- Internal names and file layout.
- The wording of each refusal, and of each tool's description.
- The layout of the tests.

## Out of scope

- Forwards.
- Trashing mail.
