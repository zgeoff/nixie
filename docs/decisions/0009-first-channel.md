# 0009: The first channel

- Date: 2026-10-08
- Status: decided
- Research: [channel notes](../research/2.5-notes/channels.md),
  [transport notes](../research/2.5-notes/transports.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#channels)

nixie's own client holds the conversation, the approvals and voice. Chat apps such as Telegram carry
only a push notice with no content, such as "nixie has 3 things for you", and a link that opens the
client. The first client can be minimal. The owner wants to explore React Native for it.

## Why

- **Storage stays home.** The model provider processes each turn, which nixie cannot avoid without a
  local model. A chat channel adds storage: Telegram keeps the full history of a bot chat on its
  servers, unencrypted end to end. The principle "Owner data stays home" forbids that storage, not
  the processing.
- **Approvals are strongest in nixie's own client.** A passkey ties each approval to the owner, and
  no chat account compromise can press the button.
- **One app holds conversation, approvals and voice,** instead of a chat channel, an approval page
  and a voice client as 3 pieces.
- **A native client avoids the web client's iOS limits:** a web app loses the microphone in the
  background or with the screen locked, and gets push only once installed to the home screen.

## Alternatives

- **Telegram as the full channel.** It meets every tier 1 need with the least work, and keeps the
  owner's whole history on Telegram's servers.
- **Self-hosted Matrix.** It keeps messages home and gives the strongest sender check, but has no
  buttons, and streaming through edits hits Synapse's default rate limit.
- **nixie's own client with no chat notifier.** It keeps everything home, and the owner misses
  pushes unless the client's own notifications reach them.

## Consequences

- nixie builds and maintains a client. A native app needs the Apple Developer Program, and
  TestFlight builds expire after 90 days. A native app can also use CallKit for calls with the
  screen locked.
- Telegram, or another chat app, as a full channel stays possible later as an opt-in for a context
  where the owner accepts the storage.
- The approval page and the voice client from the 2.5 research live inside this client.
