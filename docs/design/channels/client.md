# The client

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0009](../../decisions/0009-first-channel.md), [0011](../../decisions/0011-memory-writes.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0016](../../decisions/0016-own-interfaces.md),
  [0018](../../decisions/0018-main-thread-and-tasks.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

nixie's own client holds the conversation, the approvals and the live view, under
[0009](../../decisions/0009-first-channel.md). It runs as a web client for desktop browsers in the
first build and as a React Native app built with Expo, Android first, in tier 2. Both talk to nixie
through one typed API with a live stream, and both are the same full channel to the
[channel adapter](./channel-adapter.md). The client records which spans of each message the owner
pasted, which the memory rules in [0011](../../decisions/0011-memory-writes.md) need. Everything in
this doc beyond the decisions it links is a proposal, and the framework and library choices are in
[Decisions for the owner](#decisions-for-the-owner).

## What the client shows

The client has 4 views, and every one reads the same data the conversation reads:

- **The conversation**, the main thread from [0018](../../decisions/0018-main-thread-and-tasks.md),
  with each owner message showing where it was routed.
- **A task**, opened from the dashboard or from a routing mark, in the same conversation view.
- **The dashboard**, the view of the task board, with the conversation shown apart from the tasks
  under [0027](../../decisions/0027-tasks-and-outside-actions.md).
- **The digest sheet**, every waiting item on one sheet, under
  [0006](../../decisions/0006-approval-record.md).

[The live view](./live-view.md) covers the conversation, tasks and the dashboard, and
[approvals](./approvals.md) covers approval cards and the digest sheet. Memory management, rules and
settings are views that their own designs add to the same client.

## The typed API

The client and the server share one typed contract, and nixie writes no REST endpoints by hand. The
contract lives in its own workspace package, which the server implements and both clients import as
types only, under the workspace layout from [0025](../../decisions/0025-database-and-topology.md).
The [typed API spike](../../../spikes/client-rpc/README.md) built such a contract with oRPC and
served it from Bun through Elysia and over a WebSocket.

The contract has 3 kinds of procedure:

- **Reads**, such as the task board, a task's records from a sequence, or one proposal. They are
  safe to repeat, and TanStack Query caches them.
- **Checked actions**, one procedure per action, each with a typed input and typed errors. An
  approve takes the proposal ID and the action hash the client rendered, and the server refuses a
  hash that no longer matches with a declared `CONFLICT` error. Each checked action carries a client
  action ID, so a retried request runs once.
- **The live stream**, which follows the log by sequence. Each event carries the record's sequence
  as its event ID, so a client that reconnects sends the last ID it saw and receives exactly the
  records it missed.

In the spike, one contract carried all 3 kinds over both transports, and the stream resumed across a
server restart with no record missing and none repeated.

The stream runs as server-sent events over HTTP by default. **Why:** the fetch transport resumed by
itself through oRPC's retry plugin in the spike, and the WebSocket link took one socket with no
reconnect of its own. The WebSocket transport stays available behind the same contract.

The Expo app uses the same contract. oRPC documents Expo SDK 56 and later as streaming out of the
box, because `expo/fetch` replaces React Native's global `fetch`, whose responses have no body to
stream. Running it on a device is a [spike to run](../open-items.md#spikes-to-run).

## Owner identity and sessions

The owner signs a device in once, and the device then holds a session until the owner revokes it.
Each session is an identity row in the [owner record](./channel-adapter.md#the-owner-record).

1. On first start, nixie prints a one-time enrolment code to its log and through a command on the
   host. The code lapses after 15 min by default.
2. The owner opens the web client, enters the code and names the device.
3. nixie creates a session, stores a hash of its token, and writes a record of the enrolment.
4. To add a device later, the owner asks a signed-in client for a new enrolment code, or runs the
   command on the host again.

The web client holds the session token in a cookie marked `HttpOnly`, `Secure` and
`SameSite=Strict`, and the server also requires a custom request header on every procedure, which a
cross-site form cannot send. The Expo app holds its token in the device keystore through
`expo-secure-store` and sends it as a bearer token. A session that sends nothing for 30 days lapses,
as a default the owner can change. The client lists every session with its label and last use, and
revoking one is a checked action.

A passkey joins this scheme once [0012](../../decisions/0012-high-risk-approvals.md) lands. The
owner registers a passkey from a signed-in client, and from then on a new device signs in with the
passkey instead of an enrolment code, and an always-ask approval asks for it. WebAuthn needs a
secure origin with a stable host name, so the deployment must serve the client over HTTPS on a fixed
name, under [0020](../../decisions/0020-deployment.md).

## Sending a message

A message is sent with a client message ID, the thread it belongs to, its text and its spans:

```ts
interface SendMessage {
  clientMessageId: string; // created by the client, reused on every retry
  thread: string; // the conversation, or the task open in the client
  text: string;
  spans: { start: number; end: number; source: 'typed' | 'pasted' | 'dropped' | 'unknown' }[];
}
```

The server writes the message once per client message ID, so a send retried on a flaky network never
appears twice. The client keeps an unsent message on the device and retries it with the same ID
until the server confirms it, and shows it as pending until then.

### Paste spans

The client labels every span of a message with how it arrived. The
[paste span spike](../../../spikes/paste-spans/README.md) showed how on the web:

- The source comes from `InputEvent.inputType`. `insertFromPaste` is pasted, `insertFromDrop` is
  dropped, typing, composition and autocorrect are typed, and every other input type is unknown.
- The caret read on `beforeinput` anchors each edit, so the spans stay right when the owner types
  inside a paste, deletes across one or pastes over a selection.
- Undo and redo restore text as unknown, because the event does not say where the text came from.

Chromium and Firefox both passed every step of the spike. The same span logic runs in React Native
with a different source for each edit. React Native's text input has no paste event, and an Android
keyboard inserts its clipboard suggestions as if typed, so on native a multi-character insertion
that no paste hook flags counts as unknown. Testing that on a device is a
[spike to run](../open-items.md#spikes-to-run).

Offsets count UTF-16 code units, as JavaScript string indices do. The server checks that the spans
are ordered, do not overlap and cover the whole text, and labels a message whose spans fail the
check, or that has none, as unknown throughout. Evidence under
[0011](../../decisions/0011-memory-writes.md) needs an affirmative `typed`, so a client that cannot
tell fails closed. The spans are part of the owner message record, encrypted with its text under the
[event log design](../core/event-log.md#erasable-fields-and-keys). A later voice client adds a
`dictated` source without a change to the record's shape. A quoted block never counts as evidence
either, and the memory design finds quoted blocks in the text on the server, so the client records
only how each span arrived.

### Messages into a running task

A message to a running task reaches its model inside the current turn where it can. The
[owner input spike](../../../spikes/sdk-owner-input/README.md) found that a message with `next`
priority reaches the model at the next tool boundary and the turn goes on, while `now` with a human
origin moves a running background-capable tool aside and starts a new turn 2.7 to 4.5 s after the
send. The client therefore sends with `next` by default, and offers an interrupt control that ends
the current turn, so the message starts the next one. The cases the spike left untested, such as a
message during a long reply with no tool running, are a
[spike to run](../open-items.md#spikes-to-run).

nixie passes the message into the live session with the record's ID as the SDK message's `uuid`. The
SDK stamps that ID on the first assistant message that reads it, so the step's commit marks exactly
those records read and moves the inbox cursor past them. A step that crashes before its commit
leaves them unread, and the rerun from the session boundary under
[crash recovery](../core/tasks.md#crash-recovery) delivers them again, once.

## Deep links

Every item the owner can act on has a link of the form `https://<nixie_host>/i/<item_id>`, where the
item ID is the opaque ID of a proposal, an unknown outcome or a record. The digest sheet has
`https://<nixie_host>/digest`. A push carries only such a link, so the chat app learns an opaque ID
and nothing else. The web client opens the link after sign-in. The Android app claims the same links
as verified Android App Links, through a Digital Asset Links file that nixie serves at
`/.well-known/assetlinks.json`, so one link opens the app where it is installed and the web client
everywhere else.

## Room for voice

Voice is not in the first build, and nothing here designs it. The contract leaves room in 3 places:
a voice session becomes another kind of procedure on the same API, a transcribed message arrives
through the same send with a `dictated` source, and an approval during a call stays a checked action
on screen, which the deferred decision on approval during a voice call covers.

## Decisions for the owner

Each decision lists the options, a recommendation and the trade-off. Approving everything on the
digest sheet at once is a decision the policy design brings.

1. **The typed API layer.** Options: oRPC, tRPC 11, or Elysia's Eden. **Recommended: oRPC, served
   through Elysia, with server-sent events for the stream.** The spike showed one contract with
   typed errors, an event stream that resumes by event ID, a WebSocket transport behind the same
   contract, and documented Expo support. tRPC has the larger community and needs its own adapters
   on Bun; Eden ties the client to Elysia's route types, so the contract cannot live apart from the
   server. Elysia adds static file serving and plugins over plain `Bun.serve`, which oRPC would run
   on equally.
2. **The web client and the Expo app: one codebase or two.** Options: one Expo codebase that builds
   the web client with React Native Web; or a separate web client, with a shared package for the
   contract, the query hooks, the span logic and view state. **Recommended: a separate web client on
   Vite with TanStack Router and TanStack Query, and the shared package.** The web client is tier 1
   and desktop first, and the paste spans need the browser's `beforeinput` event, which React Native
   Web's text input offers no prop for, so the client would reach past it to the DOM node. One
   codebase builds the Android app with no second UI to write, at the cost of a weaker desktop
   experience. TanStack Start in single-page mode is the alternative for the web client; its server
   functions and server rendering duplicate the typed API and nixie's server.
3. **Signing a device in.** Options: an enrolment code from the host with device sessions; a
   password; or a passkey from the first build. **Recommended: the enrolment code with device
   sessions, and the passkey when 0012 lands.** The code needs no secret to remember and works on a
   host with no HTTPS name yet. A password adds a secret to guard and reset. A passkey from the
   start is the strongest, and needs HTTPS on a fixed host name before the first sign-in.
4. **Where approvals appear.** Options: a card in the thread that asked, plus the digest sheet; or
   the digest sheet only. **Recommended: both.** A card in the thread lets the owner approve in the
   flow of the conversation, and the sheet clears what queued while the owner was away. The sheet
   alone keeps the conversation free of buttons, at the cost of a detour for every approval.
5. **How the push notice behaves.** Options: one live notice that nixie edits as items arrive, with
   a new notice after an hour; or a new notice for each batch. **Recommended: the live notice.** The
   chat holds one current message, and the phone buzzes for news rather than for every item. A
   notice per batch makes every arrival buzz and leaves a stack of stale counts in the chat.
