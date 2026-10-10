# 0029: Channels and clients

- Date: 2026-10-09
- Status: decided
- Design: [client](../design/channels/client.md), [approvals](../design/channels/approvals.md),
  [channel adapter](../design/channels/channel-adapter.md)
- Research: [client RPC spike](../../spikes/client-rpc/),
  [paste spans spike](../../spikes/paste-spans/)

nixie's channels settle these choices:

- **Typed API.** oRPC runs through Elysia, with server-sent events for the live stream. Contract
  packages and typed checked actions connect both clients to the same procedures.
- **Two clients.** The web client is TanStack Start running as its own server, beside nixie's
  process, with `@orpc/tanstack-query` and an isomorphic link. Start's server code calls nixie's
  procedures over the private network. Start keeps no session of its own: it forwards your device
  session to nixie's API on every call, so the API is the one place that checks authority. The web
  client and the API share one host name: a reverse proxy routes `/rpc` and the live stream to
  nixie's API and every other path to Start, and the browser's own calls go to the API directly. The
  session cookie is host-only on that name, so it reaches both servers with no cross-origin setup.
  Android uses Expo. A shared package holds the contract, query hooks, paste-span logic and view
  state, and each client owns its UI. React Server Components are opt-in.
- **Device sign-in.** An enrolment code from the host creates a device session, and a passkey joins
  with [0012](./0012-high-risk-approvals.md). The web client holds a session cookie and Expo a
  bearer token, and both carry the same device-session authority. The expected deployment serves
  HTTPS on a fixed name on a private network, so the passkey needs no new infrastructure.
- **Cards and Defer.** Each proposal has a card in its thread and a place in the approval digest.
  Its choices are Approve, Always allow, Defer and Decline, plus a reply in the thread. Defer offers
  1 hour as a configurable default, this evening, tomorrow morning and a custom time, with an
  optional note. A deferred proposal stays pending in a collapsed Deferred group and counts in no
  push. At the chosen time it returns as a fresh item with a buzzing notice, subject to quiet hours.
  Defer never goes past the action's real deadline. The task gets the defer event and note and can
  do other work, and the agent does not ask why.
- **One-tap "always allow"** follows [0006](./0006-approval-record.md).
- **Two push levels.** Routine items edit the live Telegram notice quietly. Always-ask items,
  unknown outcomes and returning deferred items send a new, buzzing notice that becomes the live
  one. Quiet hours suppress loud pushes overnight except unknown outcomes, as a configurable
  default.
- **Native Android paste capture.** A native module hooks paste from the first Android build, so
  text not pasted counts as typed. Paths the module cannot yet tell apart, such as keyboard
  clipboard chips, stay unknown.

## Why

- The API spike showed oRPC's typed errors and a stream that resumes after a server restart with
  nothing lost or repeated.
- Server rendering and server components render views with their data on the first paint and keep
  heavy rendering off the browser. Start also follows the existing pattern of oRPC contract packages
  and TanStack Query, so code and habits carry over.
- Separate UIs keep browser paste events and desktop controls, at the cost of 2 UI implementations.
- A separate Start server keeps Vite, server rendering and the UI framework out of the process that
  holds policy, credentials and the approval check, and a UI crash or deploy never restarts that
  process. Forwarding the device session keeps one authority model across all routes.
- One host name lets one host-only cookie reach both servers, needs no cross-origin requests, and
  gives the passkey one name to bind to.
- Cards keep an approval beside its context, and the approval digest gathers items from your
  absence.
- Defer lets you choose when to answer without authorizing anything or losing a real deadline.
- Two push levels keep routine counts quiet while an item that needs you can buzz.
- The native paste module supplies the evidence that memory writes need on Android.

## Alternatives

- **tRPC or Eden instead of oRPC.** tRPC's contract comes from the server router, and Eden locks the
  contract to Elysia.
- **A separate Vite web app, or one Expo UI for both clients.** Vite gives up server rendering, and
  one Expo UI makes the web client a phone app in a browser.
- **Start inside nixie's Elysia process.** It saves a process and a local hop, and it puts the UI's
  dependencies and failures inside the trusted core.
- **A Start server with its own session.** It gives the web client a second auth path that must stay
  in step with the API's.
- **Two host names under one parent domain.** It needs no proxy. The session cookie then covers the
  parent domain and reaches every host under it, and the API needs cross-origin requests with
  credentials.
- **A password, or a passkey from day one.** A password is one more secret to guard and reset.
- **The approval digest alone, with no cards.** Every approval becomes a trip to one place.
- **One edited notice for all arrivals, or a new notice for every batch.** An edit never buzzes, and
  a notice per batch buzzes for routine work.
- **Android input labelled unknown by default.** Facts typed on the phone would become proposals.

## Consequences

- The deployment runs the web client as its own container or pod beside nixie, behind one reverse
  proxy.
- The session forwarding spike (`spikes/start-session-forwarding/`) checked a separate Start server
  that forwards the session and keeps none. Integration checks remain for the Expo stream on a
  device and Android paste edge cases.
