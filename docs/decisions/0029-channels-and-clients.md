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
- **Two clients.** The web client uses TanStack Start inside nixie's own Elysia process, with
  `@orpc/tanstack-query` and an isomorphic link, and Start's server code calls the procedures
  in-process. Android uses Expo. A shared package holds the contract, query hooks, paste-span logic
  and view state, and each client owns its UI. React Server Components are opt-in.
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
- **One-tap "always allow".** A routine card shows the rule that "always allow" creates, as one
  sentence, and one tap runs the action and creates that rule. A quiet line under the reply reads
  "Rule added: …" with Edit and Undo, and the rule appears in the rules list. Spending and lifting
  cards keep their own controls and never offer a one-tap "always allow".
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
- Device sessions keep one authority model across all routes.
- Cards keep an approval beside its context, and the approval digest gathers items from your
  absence. The card already shows the rule that "always allow" creates, so a second confirmation
  adds friction without adding information.
- Defer lets you choose when to answer without authorizing anything or losing a real deadline.
- Two push levels keep routine counts quiet while an item that needs you can buzz.
- The native paste module supplies the evidence that memory writes need on Android.

## Alternatives

- **tRPC or Eden instead of oRPC.** tRPC's contract comes from the server router, and Eden locks the
  contract to Elysia.
- **A separate Vite web app, or one Expo UI for both clients.** Vite gives up server rendering, and
  one Expo UI makes the web client a phone app in a browser.
- **A password, or a passkey from day one.** A password is one more secret to guard and reset.
- **The approval digest alone, with no cards.** Every approval becomes a trip to one place.
- **A second confirmation after "always allow".** It adds a tap on the most common way to stop
  repeat prompts.
- **One edited notice for all arrivals, or a new notice for every batch.** An edit never buzzes, and
  a notice per batch buzzes for routine work.
- **Android input labelled unknown by default.** Facts typed on the phone would become proposals.

## Consequences

- Integration checks remain for Start inside Elysia, the Expo stream on a device and Android paste
  edge cases.
