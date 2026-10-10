# 0016: nixie's own interfaces

- Date: 2026-10-08
- Status: decided
- Design: [channel adapter](../design/platform/channels/channel-adapter.md),
  [trigger source](../design/platform/channels/trigger-source.md),
  [connector](../design/platform/connectors/connector.md),
  [credentials](../design/platform/connectors/credentials.md),
  [definitions source](../design/platform/connectors/definitions-source.md),
  [sandbox adapter](../design/platform/connectors/sandbox-adapter.md)
- Research:
  [MCP notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.6-notes/mcp.md)

nixie takes tools from MCP and defines 6 interfaces of its own, because MCP has no counterpart for
them:

- **Channel adapter:** your messages in, replies and pushes out, your identity, and approval
  controls. The web client, the native app and the push notifier from [0009](0009-first-channel.md)
  are channel adapters.
- **Trigger source:** schedules, webhooks, and mailbox pushes and polls, each as an event in nixie's
  log with a cursor.
- **Connector:** typed calls to one outside service, with declared effects under
  [0005](0005-effects-and-taint.md) and a typed result.
- **Credential store:** OAuth clients, refresh and rotation, and the way a tool gets a credential
  without the model seeing it. It sits in front of one or more backends, such as imp's broker for
  work inside an imp, and the deployment defines its credential sources, one backend per credential
  if it likes.
- **Definitions source:** where nixie reads your definitions from, under [0020](0020-deployment.md):
  a git repo, a local path or bucket storage.
- **Sandbox adapter:** runs anything that executes a model loop or code over untrusted content in
  its own sandbox: the conversation, workers, code runs, and sessions on the built-in coding
  adapter. It covers the lifecycle, a deny-by-default network with a route back to nixie's tools,
  credential injection that the sandbox's code never sees, and running code. Sleep that keeps memory
  is a capability a backend may offer, not a requirement.

imp is the reference sandbox adapter and the only one the first build implements. A container
adapter is valid and sketched, and its sandbox shares the host's kernel, so its boundary is weaker
than a microVM's. Choosing it is your risk stance.

## Why

- MCP covers tools well. Its events are an open proposal, and it has no interface for chat channels
  or for brokering a host's own credentials.
- Each interface is a boundary where a deployment picks its own technology, which keeps the platform
  portable.
- A sketched container adapter keeps the sandbox interface honest about what it assumes from a
  microVM.

## Alternatives

- **Wait for MCP to cover triggers and channels.** Triggers would depend on a proposal that may not
  land, and nixie can adopt an MCP piece later behind its own interface.
- **Build the container adapter in the first build.** It supports hosts without KVM, and adds a
  second network, injection and lifecycle implementation that no current host needs.

## Consequences

- imp's broker injects a static value and never refreshes, so with imp as a backend, the credential
  store refreshes tokens on the host and pushes each new value into imp.
- The trigger source records a cursor per source in the event log, so a restart resumes without
  missing or repeating an event.
