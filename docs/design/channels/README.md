# Channels design

Channels cover how you reach nixie and how nixie reaches you: nixie's own client, the push notifier,
and the trigger sources that start work without you.
[0029](../../decisions/0029-channels-and-clients.md) records the choices this design follows.

- [The client](./client.md) — the web client and the Expo app, the typed API, device sessions,
  sending a message with its paste spans, messages into a running task, and deep links
- [The channel adapter](./channel-adapter.md) — the interface, the identity record, refusals, and
  the Telegram notifier with its content-free notice
- [Approvals in the client](./approvals.md) — cards, how risk classes look, how the server checks an
  answer, Defer, and the approval digest
- [The live view and the dashboard](./live-view.md) — the 2 tiers, a task as a conversation,
  stepping in, routing marks, and how the client stays current
- [The trigger source](./trigger-source.md) — the interface, schedules, polls, webhooks, and which
  services need push
