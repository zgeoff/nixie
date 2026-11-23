# Connectors design

nixie's tools reach the model over MCP, outside services reach nixie through connectors, and every
model loop and code run sits in a sandbox.

- [Connectors](connector.md) — the connector interface, setup and OAuth, Google, and search
- [The credential store](credentials.md) — backends, the fetcher, grants into a sandbox, refresh,
  disconnect and forget
- [Serving nixie's tools](tools.md) — tool definitions, what the model sees, one endpoint per task
  run, and how a model loop starts
- [The definitions source](definitions-source.md) — the interface and the path source
- [The MCP proxy](mcp-proxy.md) — external servers, pinning, effect declarations and authorization
- [Running code and coding sessions](coding.md) — the code tool, the coding adapter, atc and the
  built-in adapter
