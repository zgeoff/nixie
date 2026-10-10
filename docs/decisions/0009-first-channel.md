# 0009: The first channel

- Date: 2026-10-08
- Status: decided
- Design: [client](../design/platform/channels/client.md)
- Research:
  [channel notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.5-notes/channels.md),
  [transport notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.5-notes/transports.md)

nixie's own client holds the conversation, the approvals and voice. Chat apps such as Telegram carry
only a push notice with no content, such as "nixie has 3 things for you", and a link that opens the
client. The client runs on 2 platforms, with the stack from [0029](0029-channels-and-clients.md):

- a web client for a desktop browser, which comes first, with pushes through Telegram
- an Android app built with Expo, sideloaded during development, in tier 2 of the
  [scope](../scope.md)

A desktop app may follow, and nothing plans for it.

## Why

- **Storage stays home.** The model provider processes each turn, which nixie cannot avoid without a
  local model. A chat channel adds storage: Telegram keeps the full history of a bot chat on its
  servers ([Telegram FAQ](https://telegram.org/faq)). The principle "Your data stays home" forbids
  that storage, not the processing.
- **Approvals are strongest in nixie's own client.** A chat account compromise cannot press a button
  in it, and a passkey can tie an approval to you, which [0012](0012-high-risk-approvals.md)
  requires for the always-ask set.
- **One app holds conversation, approvals and voice,** instead of a chat channel, an approval page
  and a voice client as 3 pieces.
- **A native client avoids the web client's mobile limits.** A web app on iOS loses WebRTC and Web
  Audio in the background or with the screen locked, and gets web push only once installed to the
  Home Screen.

## Alternatives

- **Telegram as the full channel.** It meets every tier 1 need with the least work, and keeps your
  whole history on Telegram's servers.
- **Self-hosted Matrix.** It keeps messages home and gives the strongest sender check, but has no
  buttons, and streaming through edits hits Synapse's default rate limit.
- **nixie's own client with no chat notifier.** It keeps everything home, and pushes reach you only
  when the client's own notifications do.

## Consequences

- nixie builds and maintains a web client and a native app. An iOS build needs the Apple Developer
  Program at $99 a year, and its TestFlight builds expire after 90 days.
- A chat app as a full channel stays possible as an opt-in for a context where you accept the
  storage.
