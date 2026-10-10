# The client

- Decisions: [0029](../../decisions/0029-channels-and-clients.md),
  [0002](../../decisions/0002-approvals.md), [0009](../../decisions/0009-first-channel.md),
  [0011](../../decisions/0011-memory-writes.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0025](../../decisions/0025-database-and-topology.md)

nixie's own client holds the conversation, the approvals and the live view. The first build ships a
web client for desktop browsers, and the Android app, built with Expo, follows in tier 2. Both talk
to nixie through one typed API with a live stream, and both record which spans of each message you
pasted. Its views are the conversation, a task, the [dashboard](./live-view.md) and the
[approval digest](./approvals.md).

## The typed API

The client and the server share one oRPC contract in its own workspace package, which the server
implements and both clients import as types only. The contract has 3 kinds of procedure:

- **Reads**, such as the task board or one proposal, which TanStack Query caches.
- **Checked actions**, one procedure per action with a typed input and typed errors. Each carries a
  client action ID, so a retried request runs once.
- **The live stream**, server-sent events that follow the event log by sequence. Each event's ID is
  the record's sequence, so a client that reconnects receives exactly the records it missed.

A WebSocket transport stays available behind the same contract for 2-way streaming such as voice.
The [typed API spike](../../../spikes/client-rpc/) holds the transport and resume evidence.

## Two clients, one contract

The web client runs on TanStack Start, mounted inside nixie's own Elysia process. Start's server
code calls the oRPC procedures in-process through an isomorphic link, and the browser and Expo use
the HTTP link. Both routes build the same device-session context, so server rendering grants no
extra authority. React Server Components are opt-in. A shared package holds the contract, the
`@orpc/tanstack-query` hooks, the paste-span logic and the view state, and each client owns its UI.
The Expo app streams through `expo/fetch`.

## Device sessions

You sign a device in once with an enrolment code, and the device holds a session until you revoke
it. nixie prints the code to its log and through a host command, and a signed-in client issues codes
for later devices. A code lapses after 15 min by default. nixie stores only a hash of each session
token, and each session is a row in the [identity record](./channel-adapter.md).

The web client keeps its token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, and every
procedure requires a custom header that a cross-site form cannot send. The Expo app keeps its token
in `expo-secure-store` and sends it as a bearer token. A session lapses after 30 days without use by
default. The client lists every session, and revoking one is a checked action.

With [0012](../../decisions/0012-high-risk-approvals.md), you register a passkey from a signed-in
client. New devices then sign in with it, and always-ask approvals ask for it. WebAuthn needs HTTPS
on a fixed host name, which the expected private-network deployment serves.

## Sending a message

```ts
interface SendMessage {
  clientMessageId: string; // created by the client, reused on every retry
  thread: string; // the conversation, or the task open in the client
  text: string;
  spans: { start: number; end: number; source: 'typed' | 'pasted' | 'dropped' | 'unknown' }[];
}
```

The server writes a message once per client message ID. The client keeps an unsent message on the
device as pending and retries it with the same ID until the server confirms it.

### Paste spans

The client labels every span of a message with how it arrived, because memory evidence needs text
you typed. On the web, the label comes from `InputEvent.inputType` on `beforeinput`, with the
selection pinning each edit; undo and redo restore text as unknown. The Android app ships a native
module from its first build that hooks paste. Paths known to bypass the hook, such as keyboard
clipboard chips, stay unknown until the module tells them apart.

Offsets count UTF-16 code units. The server labels a message as unknown throughout when its spans
are out of order, overlap or leave a gap, so a client that cannot tell fails closed. The spans are
encrypted with the text. The [paste span spike](../../../spikes/paste-spans/) holds the browser
evidence.

### Messages into a running task

A message to a running task reaches its model at the next tool boundary, through the SDK's `next`
priority, and an interrupt control ends the current turn so your message starts the next one. nixie
passes the record's ID as the SDK message `uuid`, and the SDK stamps it on the assistant message
that reads it, so the step's commit marks exactly those records read. A crash before the commit
leaves them unread, and [crash recovery](../core/tasks.md) delivers them again, once. The
[owner input spike](../../../spikes/sdk-owner-input/) holds the evidence.

## Deep links

Every item you can act on has a link `https://<nixie_host>/i/<item_id>` with an opaque ID, and the
approval digest is `https://<nixie_host>/digest`. A push carries only such a link. The Android app
claims the same links as verified App Links, so a link opens the app where it is installed and the
web client everywhere else.

A voice client later adds a procedure on the same API and a `dictated` span source, with no change
to the message record.
