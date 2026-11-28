# Platform design

The platform design is the locked baseline of nixie's first build, one folder per area.

- [Core](core/README.md) — the event log, tasks, the action queue and model profiles
- [Policy](policy/README.md) — the decision point, rules, proposals and approvals, and budgets
- Memory — [writes](memory/writes.md), [memory in context](memory/context.md) and
  [moments](memory/moments.md)
- [Channels](channels/README.md) — the client, the channel adapter, approvals, the live view and the
  trigger source
- [Connectors](connectors/README.md) — connectors, tools and the MCP endpoint, the sandbox and
  credentials
- [Deployment](deployment/README.md) — the host, backups, the release pipeline and upgrades

## nixie's own interfaces

nixie takes its tools from MCP and defines 6 interfaces of its own where MCP has none. Each one is a
boundary where a deployment picks its own technology:

- [Channel adapter](channels/channel-adapter.md): your messages in, replies and pushes out
- [Trigger source](channels/trigger-source.md): schedules and polls of mail and calendars
- [Connector](connectors/connector.md): typed calls to one outside service
- [Credential store](connectors/credentials.md): OAuth clients, refresh and the credentials a tool
  gets without the model seeing them
- [Definitions source](connectors/definitions-source.md): where nixie reads your definitions from
