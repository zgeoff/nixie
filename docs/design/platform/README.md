# Platform design

The platform design is the locked baseline of nixie's first build, one folder per area.

- [Core](core/README.md) — the event log, tasks, the action queue and model profiles
- [Policy](policy/README.md) — the decision point, rules, proposals and approvals, and budgets
- [Memory](memory/store.md) — the store, writes, memory in context, and [moments](memory/moments.md)
- [Channels](channels/README.md) — the client, the channel adapter, approvals, the live view and the
  trigger source
- [Connectors](connectors/README.md) — connectors, tools and the MCP endpoint, the sandbox and
  credentials
- [Deployment](deployment/README.md) — the host, backups, the release pipeline and upgrades
- [Skills](skills.md) — skills in the definitions, the lock, versions and the skill tools
