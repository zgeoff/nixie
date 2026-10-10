# 0009: The first channel

- Date: 2026-10-08
- Status: decided, amended by [0012](./0012-high-risk-approvals.md) and
  [0029](./0029-channels-and-clients.md)
- Research: [channel notes](../research/2.5-notes/channels.md),
  [transport notes](../research/2.5-notes/transports.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#channels)

nixie's own client holds the conversation, the approvals and voice. Chat apps such as Telegram carry
only a push notice with no content, such as "nixie has 3 things for you", and a link that opens the
client. The first client can be minimal.

The client runs on 2 platforms:

- a web client for a desktop browser
- a React Native app built with Expo, Android first, sideloaded during development

A desktop app may follow later, and nothing plans for it now.

The web client comes first, with pushes through a chat notifier such as Telegram, and the Android
app follows in tier 2 of the [scope](../scope.md).

## Why

- **Storage stays home.** The model provider processes each turn, which nixie cannot avoid without a
  local model. A chat channel adds storage: Telegram keeps the full history of a bot chat on its
  servers, because bot chats are cloud chats with server-client encryption only
  ([Telegram FAQ](https://telegram.org/faq), 2026-10-08). The principle "Owner data stays home"
  forbids that storage, not the processing.
- **Approvals are strongest in nixie's own client.** A chat account compromise cannot press a button
  in it, and a passkey can tie an approval to the owner, which [0012](./0012-high-risk-approvals.md)
  requires for the always-ask set.
- **One app holds conversation, approvals and voice,** instead of a chat channel, an approval page
  and a voice client as 3 pieces.
- **A native client avoids the web client's iOS limits.** A web app loses WebRTC and Web Audio in
  the background or with the screen locked
  ([Apple forums](https://developer.apple.com/forums/thread/774239), 2026-10-08). From iOS 16.4, it
  gets web push only once installed to the Home Screen
  ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
  2026-10-08).

## Alternatives

- **Telegram as the full channel.** It meets every tier 1 need with the least work, and keeps the
  owner's whole history on Telegram's servers.
- **Self-hosted Matrix.** It keeps messages home and gives the strongest sender check, but has no
  buttons, and streaming through edits hits Synapse's default rate limit of 0.2 per second with a
  burst of 10
  ([Synapse user admin API](https://element-hq.github.io/synapse/latest/admin_api/user_admin_api.html),
  2026-10-08).
- **nixie's own client with no chat notifier.** It keeps everything home, and the owner misses
  pushes unless the client's own notifications reach them.

## Consequences

- nixie builds and maintains a web client and a native app. Android first means sideloading needs no
  developer account. An iOS build later needs the Apple Developer Program at $99 a year
  ([Apple memberships](https://developer.apple.com/support/compare-memberships/), 2026-10-08), and
  TestFlight builds expire after 90 days
  ([TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview),
  2026-10-08). On iOS, the native app can use CallKit for calls with the screen locked.
- Telegram, or another chat app, as a full channel stays possible later as an opt-in for a context
  where the owner accepts the storage.
- The approval page and the voice client live inside this client.
