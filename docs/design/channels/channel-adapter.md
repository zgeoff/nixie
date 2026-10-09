# The channel adapter

- Status: Proposed
- Decisions: [0029](../../decisions/0029-channels-and-clients.md),
  [0002](../../decisions/0002-approvals.md), [0006](../../decisions/0006-approval-record.md),
  [0009](../../decisions/0009-first-channel.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0016](../../decisions/0016-own-interfaces.md), [0020](../../decisions/0020-deployment.md)

A channel adapter connects one way of reaching the owner to nixie: owner messages and checked
actions come in, and replies, live updates and pushes go out. nixie has 2 kinds of adapter. A full
channel carries the conversation and the approvals, and nixie's own client is the only full channel
in the first build. A push notifier carries only a notice with no content and a link to the client,
and Telegram is the first, under [0009](../../decisions/0009-first-channel.md). Every adapter
resolves each inbound event to the one owner through the owner record, or refuses it. Everything in
this doc beyond the decisions it links is a proposal.

## The interface

An adapter declares what it carries, and nixie's core calls it through 3 entry points. The shape
below is a sketch in TypeScript; names follow the glossary and stay provisional until the
terminology pass.

```ts
interface ChannelAdapter {
  id: string; // such as 'client' or 'telegram'
  carries: { conversation: boolean; approvals: boolean; push: boolean; voice: boolean };
  start(context: ChannelContext): Promise<void>;
  stop(): Promise<void>;
  push?(notice: PushNotice): Promise<PushResult>;
}

interface ChannelContext {
  resolveOwner(channelId: string, externalId: string): OwnerIdentity | null;
  receiveMessage(message: InboundMessage): Promise<MessageReceipt>;
  receiveAction(action: CheckedAction): Promise<ActionResult>;
  refuse(event: RefusedEvent): Promise<void>;
  follow(after: number, signal: AbortSignal): AsyncIterable<LiveUpdate>;
}
```

- `receiveMessage` writes an `owner_message` record and routes it, under
  [tasks](../core/tasks.md#routing-from-the-conversation). The message carries its client message
  ID, its thread and its paste spans, which [the client](./client.md#sending-a-message) covers.
- `receiveAction` handles every checked action: approve, defer, decline, settle an unknown outcome,
  pause, stop, restart, close, and move a message to another task. Each one has its own typed input,
  is checked against the owner's session or channel identity, and writes its own record.
- `follow` streams the log by sequence with the projection rows each record changed, which
  [the live view](./live-view.md#how-the-client-stays-current) covers.
- `push` sends a content-free notice, and only a push notifier implements it in the first build.

A chat message never reaches `receiveAction`. **Why:** under
[0002](../../decisions/0002-approvals.md), an approval is an action nixie checks, so the interface
gives approvals a separate entry point that no text path can reach.

The `voice` flag stays false in the first build. A voice adapter later uses the same entry points:
its transcribed words arrive through `receiveMessage` with a dictated source on their spans, and an
approval during a call still needs a checked action, which stays a
[deferred decision](../open-items.md#deferred-decisions).

## The owner record

nixie keeps one owner record, with one identity row per channel. Every adapter resolves an inbound
event to the owner through it, and the record of each message and checked action holds the channel
and the identity row it came through. **Why:** the scope marks the owner's identity on each channel
as a requirement to design for from the start, and one record lets a later channel join the same
conversation.

| Field       | Holds                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| Channel     | `client` or `telegram`, and later channels by their adapter ID            |
| External ID | A device session ID, or a Telegram user ID together with its private chat |
| Label       | A name the owner sets, such as "laptop" or "phone"                        |
| Created     | When the identity was paired, with the record of the pairing              |
| Last seen   | When the identity last sent anything                                      |
| Revoked     | When the owner revoked it; a revoked identity resolves to nobody          |

[The client](./client.md#owner-identity-and-sessions) covers device sessions, and a passkey
credential joins the client's rows once [0012](../../decisions/0012-high-risk-approvals.md) lands.

### Refusals

An event that resolves to nobody gets a refusal record with the channel, the external ID and the
time, and nothing of its content. **Why:** a stranger's text is untrusted content that no one asked
nixie to keep, and the envelope is enough to show that someone tried. A burst of refusals from one
external ID collapses into one record per hour, so a spammer cannot grow the log.

## The client adapter

nixie's own client is a full channel. Its adapter is the typed API that
[the client](./client.md#the-typed-api) serves: each procedure checks the session, then calls the
same `ChannelContext` entry points. The web client and the Expo app share it, so both are one
channel with one identity row per device.

## The push notifier

A push notifier tells the owner that something waits, and nothing else. Telegram is the first,
through a bot that the owner registers with BotFather and whose token is a deployment secret under
[0020](../../decisions/0020-deployment.md). nixie ships no central bot, so each owner's notices pass
only through their own bot.

### Pairing Telegram

The owner pairs Telegram from a signed-in client:

1. The client asks for a pairing code and shows a link of the form
   `https://t.me/<bot_username>?start=<pairing_code>`.
2. The owner opens the link, and Telegram sends `/start <pairing_code>` from the owner's account.
3. The adapter matches the code, which is single use and lapses after 10 min by default, and stores
   the sender's `from.id` and the private chat ID as a Telegram identity row.
4. The bot answers with a confirmation, and the client shows the paired row.

**Why:** the code proves that the person holding a signed-in client also holds the Telegram account,
and a Telegram bot cannot message anyone who has not sent it `/start` first.

### Receiving

The adapter reads updates by long polling with `getUpdates`, so nixie needs no inbound route for
Telegram. **Why:** a webhook would need a public route to the host, and a poll that holds the
connection open delivers an update within seconds.

The bot never carries the conversation. An inbound text from the owner gets one fixed reply, "nixie
doesn't read messages here", with a button that opens the client. nixie writes a record that the
owner wrote on Telegram, with the time and no part of the text. An inbound text from anyone else
gets a refusal record and no reply. **Why:** under [0009](../../decisions/0009-first-channel.md) the
chat app holds no conversation, and replying to strangers would confirm that the bot is live.

### What a notice holds

A notice holds a count, a fixed sentence and a link, such as "nixie has 3 things for you" with a
button labelled "Open nixie". The link points at the client with an opaque item ID, which
[the client](./client.md#deep-links) resolves. It never names a task, a person, an action or an
amount. **Why:** Telegram keeps the full history of a bot chat, so anything in the notice rests on
Telegram's servers.

nixie keeps one live notice. Routine items edit that notice quietly, with no buzz. Always-ask items,
unconfirmed outcomes and returning deferred items send a new, buzzing notice, which becomes the live
notice. When no active item waits, nixie edits the live notice to "Nothing waiting". Deferred
proposals count in no push. Opening an item does not answer it or remove its count.

### When nixie pushes

nixie pushes when an item needs the owner and the owner has no client open:

- a proposal, under [0002](../../decisions/0002-approvals.md)
- an unknown outcome that needs the owner, under [outside actions](../core/outside-actions.md)
- a question that ends a turn, and a task's report flagged for the owner's attention, such as a
  morning report

An owner counts as present when a client has shown the conversation or a task within the last 2 min,
and nixie then skips the push, because the client shows the item itself. nixie batches the items
that arrive within 30 s into one notice. Quiet hours suppress loud pushes overnight by default,
except for unconfirmed outcomes. A loud push held by quiet hours goes out when they end if the item
still waits. Presence, batching and quiet-hour times are settings the owner can change.

## Room for later channels

The interface leaves room for 3 later kinds of adapter without a change to the core:

- **Native push** for the Expo app, carrying the same content-free notice through Expo's push
  service or Firebase Cloud Messaging, with an Android notification action that requires a device
  unlock.
- **Web push** for the web client, which needs no third party beyond the browser's push service.
- **A chat app as a full channel,** which [0009](../../decisions/0009-first-channel.md) keeps
  possible as an opt-in. Its adapter would implement `receiveMessage`, and its approvals would still
  open the client, because a chat message never counts as an approval.
