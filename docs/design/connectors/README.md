# Connectors design

nixie's tools reach the model over MCP, outside services reach nixie through connectors, and every
model loop and code run sits in a sandbox. [Connectors](./connector.md) holds the decisions for the
owner.

- [Connectors](./connector.md) — the connector interface, connections, setup and OAuth, the Google
  connector, search on Kagi, and the decisions for the owner
- [The credential store](./credentials.md) — backends, the fetcher that keeps tokens out of
  connectors, grants into a sandbox, refresh and statuses
- [Serving nixie's tools](./tools.md) — tool definitions, what the model sees of a result, one
  endpoint per run, and the options every model loop starts with
- [The sandbox adapter](./sandbox-adapter.md) — the lifecycle, sandboxes by kind of work, the route
  from an imp to nixie's tools, images, and a container adapter
- [The definitions source](./definitions-source.md) — one interface over a git repo, a local path
  and bucket storage, with a content hash that does not depend on the source
- [The MCP proxy](./mcp-proxy.md) — adding an outside server, pinning by hash, effect declarations,
  calls, input requests and authorization
- [Running code and coding sessions](./coding.md) — the code tool, the coding agent adapter, the atc
  adapter and the built-in adapter
