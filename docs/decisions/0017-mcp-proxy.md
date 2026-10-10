# 0017: External MCP servers

- Date: 2026-10-08
- Status: decided
- Design: [MCP proxy](../design/connectors/mcp-proxy.md)
- Research: [proxy spike](../../spikes/mcp-proxy-pin/),
  [MCP notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.6-notes/mcp.md)

An external server is any MCP server that is not part of nixie's own code, whoever wrote it. Your
own servers count, such as atc's, because nixie's rules cannot see inside them. Every external
server reaches the model only through a nixie proxy, as [0002](./0002-approvals.md) requires: nixie
acts as the MCP client, and the model never connects to the server.

The proxy:

- records each tool's description and schemas by hash, and stops a tool whose hash changes until you
  approve the change
- lets you mark a server as trusted, and then applies a changed hash with a notice instead of
  stopping the tool
- requires an effect declaration for every tool, made by you or a reviewed starter set, with the
  server's annotations at most pre-filling it
- prefixes each tool name with a server identifier

The proxy arrives with the first external server nixie uses, and atc is the first.

A sandbox adapter that nixie ships, such as the imp adapter, is part of nixie and follows nixie's
own rules, including [0007](./0007-grants-and-taint.md). An MCP server you give nixie, such as one
that manages your own imp server, is an external server, even when it manages the same kind of
system.

## Why

- Authorship does not make a server's behaviour visible to nixie's rules. The MCP spec states that
  "clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers"
  ([MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- Hash pinning stops a server from swapping a tool's description after you reviewed it. For your own
  servers, a blocked upgrade costs more than it protects, so a notice is enough.
- The rule engine from [0004](./0004-rule-engine.md) needs declared effects to decide anything, so
  trust in a server never removes them.

## Alternatives

- **Treat your own servers as part of nixie.** Their tools would skip pinning and effect
  declarations, and the rule engine could not match on them.

## Consequences

- The platform encodes no special handling for tools that start or message other agents. Their
  effects are declared like any other, and your rules decide them.
- Judging taint by output field waits for the per-run taint stage in [0015](./0015-taint-scope.md).
