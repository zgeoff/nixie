# The channel adapter

- Decisions: [0029](../../decisions/0029-channels-and-clients.md),
  [0002](../../decisions/0002-approvals.md), [0009](../../decisions/0009-first-channel.md),
  [0016](../../decisions/0016-own-interfaces.md)

A channel adapter connects one way of reaching you to nixie. A full channel carries the conversation
and the approvals, and nixie's own client is the only one in the first build. A push notifier
carries only a content-free notice with a link to the client, and Telegram is the first. Every
adapter resolves each inbound event to you through the identity record, or refuses it.

## The interface

```ts
interface ChannelAdapter {
  id: string; // such as 'client' or 'telegram'
  carries: { conversation: boolean; approvals: boolean; push: boolean; voice: boolean };
  start(context: ChannelContext): Promise<void>;
  stop(): Promise<void>;
  push?(notice: PushNotice): Promise<PushResult>;
}

interface ChannelContext {
  resolveIdentity(channelId: string, externalId: string): Identity | null;
  receiveMessage(message: InboundMessage): Promise<MessageReceipt>;
  receiveAction(action: CheckedAction): Promise<ActionResult>;
  refuse(event: RefusedEvent): Promise<void>;
  follow(after: number, signal: AbortSignal): AsyncIterable<LiveUpdate>;
}
```

`receiveMessage` records your message and routes it. `receiveAction` takes every checked action,
such as approve, defer, pause or move, each with its own typed input and record. `follow` streams
the event log, and only a push notifier implements `push`. A chat message never reaches
`receiveAction`. **Why:** an approval is an action nixie checks, so no text path can reach it.

## The identity record

nixie keeps one identity record for you, with one row per channel identity: its channel, its
external ID (a device session, or a Telegram user and private chat), a label, when it was paired,
when it was last seen, and when it was revoked. Every message and checked action records the row it
came through, and a revoked row resolves to nobody. **Why:** one record lets a later channel join
the same conversation.

An event that resolves to nobody gets a refusal record with its channel, external ID and time, and
none of its content, at most one per external ID per hour. **Why:** a stranger's text is untrusted
content nobody asked nixie to keep.

The client's adapter is the [typed API](./client.md), and the web client and the Expo app are one
channel with one identity row per device.

## The push notifier

The push notifier tells you that something waits, and nothing else. Telegram runs through a bot you
register with BotFather, whose token is a deployment secret; nixie ships no central bot. You pair it
from a signed-in client, which shows a link `https://t.me/<bot_username>?start=<pairing_code>`. The
single-use code lapses after 10 min and proves that whoever holds the client also holds the Telegram
account.

The adapter reads updates by long polling, so Telegram needs no inbound route. The bot never carries
the conversation: a text from you gets one fixed reply with a link to the client, and a text from
anyone else gets a refusal record and no reply.

### What a notice holds

A notice holds a count, a fixed sentence and a link, such as "nixie has 3 things for you". It never
names a task, a person, an action or an amount. **Why:** Telegram keeps a bot chat's history on its
servers.

nixie keeps one live notice, at 2 levels:

- **Quiet:** routine items edit the live notice, with no buzz.
- **Loud:** always-ask items, unknown outcomes and returning deferred items send a new, buzzing
  notice, which becomes the live notice.

nixie pushes only when no client has shown the conversation or a task in the last 2 min, and batches
items within 30 s. Quiet hours hold loud pushes overnight, except unknown outcomes. Presence,
batching and quiet hours are settings.

## Room for later channels

The interface takes later adapters without a change to the core: native push for the Expo app, web
push for the web client, and a chat app as a full channel, opt-in under
[0009](../../decisions/0009-first-channel.md). A chat channel's approvals still open the client.
