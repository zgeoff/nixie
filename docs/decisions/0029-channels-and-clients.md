# 0029: Channels and clients

- Date: 2026-10-09
- Status: decided
- Amends: [0006](./0006-approval-record.md), [0009](./0009-first-channel.md)
- Design: [client](../design/channels/client.md), [approvals](../design/channels/approvals.md),
  [channel adapter](../design/channels/channel-adapter.md)

The owner agreed these channels choices:

- **Typed API.** oRPC runs through Elysia, with server-sent events for the live stream. Contract
  packages and typed checked actions connect both clients to the same procedures.
- **Two clients.** The web client uses TanStack Start inside nixie's own Elysia process, with
  `@orpc/tanstack-query` and an isomorphic link. Start's server code calls the procedures
  in-process. Android uses Expo. A shared package holds the contract, query hooks, paste-span logic
  and view state; each client owns its UI. React Server Components remain opt-in and experimental.
- **Device sign-in.** An enrolment code from the host creates a device session now. A passkey joins
  when [0012](./0012-high-risk-approvals.md) lands. Web uses a session cookie, Expo a bearer token;
  server code uses the same device-session authority. The expected private-network deployment
  already serves HTTPS on a fixed name, so the passkey needs no new infrastructure.
- **Approvals.** Each proposal has a card in its thread and a place on the digest sheet. Its choices
  are Approve, Always allow, Defer and Decline, plus a reply in the thread. Defer offers 1 hour as a
  configurable default, this evening, tomorrow morning and custom, with an optional note. It leaves
  the proposal pending in a collapsed Deferred group and counts in no push. At the chosen time the
  proposal returns as a fresh item with a buzzing notice, subject to quiet hours. Defer extends the
  lapse, never past the action's real deadline; the client offers no time past it. The task gets the
  defer event and note and can do other work. The agent does not ask why by default; at most it
  acknowledges the return time. Approval remains bound to the exact action, and policy runs again on
  approval.
- **One-tap "always allow".** A routine card shows the rule that "always allow" creates, as one
  sentence, and one tap runs the action and creates that rule. The approval binds the hash of the
  action and the hash of the rule the owner saw. A quiet line under the reply reads "Rule added: …"
  with Edit and Undo, and the rule appears in the rules list. Spending and lifting cards keep their
  own controls and never offer a one-tap "always allow". Once the passkey from 0012 ships, an
  "always allow" takes it. A proposed exemption for a rule no wider than the card's own action waits
  for the 0012 design.
- **Two push levels.** Routine items edit the live Telegram notice quietly. Always-ask items,
  unknown outcomes and returning deferred items send a new, buzzing notice that becomes the live
  one. Quiet hours suppress loud pushes overnight except unknown outcomes, as a configurable
  default.
- **Native Android paste capture.** Build a native module that hooks paste from the first Android
  build, so text not pasted counts as typed. Extend its depth through device checks. Clipboard chips
  and other ambiguous keyboard paths remain in open items; known ambiguous paths stay unknown until
  the module distinguishes them.

## Why

The API spike supports oRPC, typed errors and a resumable stream. Start gives the web client server
rendering and in-process procedure calls inside one server, while Expo keeps the Android UI native.
Server rendering and server components improve the web client's UX: views render with their data on
the first paint, and heavy rendering stays off the browser. Start also matches the owner's existing
pattern of oRPC contract packages and TanStack Query, so code and habits carry over. Separate UIs
preserve browser paste events and desktop controls at the cost of two UI implementations. Device
sessions keep one authority model across all routes.

Cards keep an approval beside its context, and the sheet gathers items from the owner's absence. The
card that offers "always allow" already asks the owner about the rule it shows, so a second
confirmation adds friction without adding information. Defer lets the owner choose when to answer
without authorizing anything or losing a real deadline. Two push levels keep routine counts quiet
while an item that needs attention can buzz. The native paste module supplies the evidence that
memory rules need on Android.

## Alternatives

- tRPC or Eden instead of oRPC; the spike showed the needed contract and stream through oRPC.
- A separate Vite web app, or one Expo UI for both clients. Start adds server integration work;
  separate UIs add UI work but preserve each platform's controls.
- A password or a passkey from day one instead of enrolment codes and staged passkey support.
- The digest sheet alone, with no thread cards or explicit defer control.
- A second confirmation in the always-ask style after "always allow". It adds a tap on the most
  common way to stop repeat prompts, and the card already shows the rule.
- One edited notice for all arrivals, or a new notice for every batch.
- Native input labelled unknown by default instead of a native paste hook.

## Consequences

The designs now follow these choices. Integration checks remain for Start inside Elysia, the Expo
stream on a device and Android paste edge cases. The core design adopts changed projection rows in
stream events, SDK message `uuid` read tracking, trigger-event waits and move-message corrections.
These technical additions do not authorize new outside actions or change policy's authority.
