# Connectors design

nixie's tools reach the model over MCP, outside services reach nixie through connectors, and every
model loop and code run sits in a sandbox.
[0030](../../decisions/0030-connectors-and-sandbox-environments.md) records the choices.

- [Connectors](./connector.md) — the connector interface, setup and OAuth, Google, and search
- [The credential store](./credentials.md) — backends, the fetcher, grants into a sandbox, refresh,
  disconnect and forget
- [Serving nixie's tools](./tools.md) — tool definitions, what the model sees, one endpoint per task
  run, and how a model loop starts
- [The sandbox adapter](./sandbox-adapter.md) — the lifecycle, sandboxes by kind of work, the route
  to nixie's tools, images, and a container sketch
- [The definitions source](./definitions-source.md) — one interface over a git repo, a local path
  and bucket storage
- [The MCP proxy](./mcp-proxy.md) — external servers, pinning, effect declarations and authorization
- [Running code and coding sessions](./coding.md) — the code tool, the coding adapter, atc and the
  built-in adapter
