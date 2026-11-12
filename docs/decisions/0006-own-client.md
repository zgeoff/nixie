# 0006: nixie's own client holds the conversation, and chat apps carry only pushes

- Date: 2026-10-08
- Status: decided

## Decision

nixie's own client holds the conversation, the approvals and voice. Chat apps such as Telegram carry
only a push notice with no content, such as "nixie has 3 things for you", and a link that opens the
client.

## Why

- **Storage stays home.** The model provider processes each turn, which nixie cannot avoid without a
  local model. A chat channel adds storage: Telegram keeps the full history of a bot chat on its
  servers ([Telegram FAQ](https://telegram.org/faq)). The principle "Your data stays home" forbids
  that storage, not the processing.
- **Approvals are strongest in nixie's own client.** A chat account compromise cannot press a button
  in it, and a passkey can tie an approval to you.
- **One app holds conversation, approvals and voice,** instead of a chat channel, an approval page
  and a voice client as 3 pieces.

## Rejected alternatives

| Option                                   | Why not                                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram as the full channel             | It meets every tier 1 need with the least work, and keeps your whole history on Telegram's servers.                                             |
| self-hosted Matrix                       | It keeps messages home and gives the strongest sender check, but has no buttons, and streaming through edits hits Synapse's default rate limit. |
| nixie's own client with no chat notifier | It keeps everything home, and pushes reach you only when the client's own notifications do.                                                     |

## Consequences

- A chat app as a full channel stays possible as an opt-in for a context where you accept the
  storage.
