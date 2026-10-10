# Channels design

How the owner reaches nixie and how nixie reaches the owner: nixie's own client, the push notifier,
and the trigger sources that start work without the owner. [The client](./client.md) is the main doc
and follows the agreed choices in [0029](../../decisions/0029-channels-and-clients.md).

- [The client](./client.md) — the web client and the Expo app, the typed API, owner identity and
  sessions, sending a message with its paste spans, messages into a running task, and deep links
- [The channel adapter](./channel-adapter.md) — the interface, the owner record, refusals, and the
  Telegram notifier with its content-free notice
- [Approvals in the client](./approvals.md) — approval cards, how risk classes look, how the server
  checks an answer, and the digest sheet
- [The live view and the dashboard](./live-view.md) — the dashboard, a task as a conversation,
  stepping in, routing marks, and how the client stays current
- [The trigger source](./trigger-source.md) — the interface, schedules, polls, webhooks, and which
  services need push
