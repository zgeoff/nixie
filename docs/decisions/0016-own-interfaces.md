# 0016: nixie's own interfaces

- Date: 2026-10-08
- Status: decided, amended by [0020](./0020-deployment.md)
- Research: [MCP notes](../research/2.6-notes/mcp.md#triggers-channels-and-brokering),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#connectors-and-mcp)

nixie takes tools from MCP and defines 4 interfaces of its own, because MCP has no final counterpart
for them:

- **Channel adapter:** owner messages in, replies and pushes out, the owner's identity, and approval
  buttons. The web client, the native app and a push notifier from [0009](./0009-first-channel.md)
  are channel adapters.
- **Trigger source:** schedules, webhooks, and mailbox pushes and polls, each as an event in nixie's
  log with a cursor.
- **Connector:** typed calls to one outside service, with declared effects under
  [0005](./0005-effects-and-taint.md) and a typed result.
- **Credential store:** OAuth clients, refresh and rotation, and the way a tool gets a credential
  without the model seeing it.

Phase 3 designs the channel adapter and the trigger source in full, because the first build needs a
client and schedules. It sketches the connector and the credential store roughly, to check that the
first 2 leave room for them, and the first real connector settles their final shape.
[0020](./0020-deployment.md) adds a fifth interface, the definitions source adapter, which Phase 3
sketches with them.

## Credential backends

The credential store sits in front of one or more backends. imp's credential broker is one backend,
for work inside an imp under [0007](./0007-grants-and-taint.md). The deployment defines its
credential sources, and it may mix them, such as one backend per credential. The design of the
backend interface is open.

## Why

- MCP covers tools well. Its events are an open proposal, SEP-3415, opened on 2026-10-05
  ([PR 3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415), 2026-10-08).
  MCP has no interface for chat channels or for brokering a host's own credentials.
- The channel adapter and the trigger source carry the first build, so their design pays off at
  once.
- A rough sketch of the other 2 can expose a constraint on the first 2 early, while their final
  shape depends on details that only a real connector shows, such as how a service refreshes tokens.

## Alternatives

- **Design all 4 in full before any code.** It risks abstractions that the first connector
  contradicts.
- **Wait for MCP to cover triggers and channels.** Triggers would depend on a proposal that may not
  land, and nixie can adopt an MCP piece later behind its own interface.

## Consequences

- imp's broker injects a static value and never refreshes, so with imp as a backend, the credential
  store refreshes tokens on the host and pushes each new value into imp, unless imp takes refresh on
  as a candidate imp change.
- The trigger source records a cursor per source in the event log, so a restart resumes without
  missing or repeating an event.
