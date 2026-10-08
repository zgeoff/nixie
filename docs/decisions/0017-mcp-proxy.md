# 0017: Outside MCP servers

- Date: 2026-10-08
- Status: decided
- Research: [MCP notes](../research/2.6-notes/mcp.md#proxying-third-party-mcp-servers),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#connectors-and-mcp)

An outside MCP server is any MCP server that is not part of nixie's own code, whoever wrote it. The
owner's own servers count, because nixie's rules cannot see inside them. Every outside server
reaches the model only through a nixie proxy, as [0002](./0002-approvals.md) requires: nixie acts as
the MCP client, and the model never connects to the server.

The proxy:

- records each tool's description and schemas by hash, and stops a tool whose hash changes until the
  owner approves the change
- lets the owner mark a server as trusted, and then applies a changed hash with a notice instead of
  stopping the tool
- requires an effect declaration for every tool, made by the owner or a reviewed starter set, with
  the server's annotations at most pre-filling it
- prefixes each tool name with a server identifier

The proxy is not part of the first build. It arrives with the first outside server nixie uses.

## Platform adapters and outside servers

A workload adapter that nixie ships, such as the adapter that runs work in imps under
[0003](./0003-sdk-placement.md), is part of nixie and follows nixie's own rules, including the grant
rules in [0007](./0007-grants-and-taint.md). An MCP server that an owner gives nixie, such as one
that manages that owner's imp server, is an outside server, even when it manages the same kind of
system. Any owner may point it at any server.

## Why

- Authorship does not make a server's behaviour visible to nixie's rules. The MCP spec states that
  "clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers"
  ([MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), 2026-10-08).
- Hash pinning stops a server from swapping a tool's description after the owner reviewed it. For
  the owner's own servers, a blocked upgrade costs more than it protects, so a notice is enough.
- The rule engine from [0004](./0004-rule-engine.md) needs declared effects to decide anything, so
  trust in a server never removes them.

## Alternatives

- **Treat the owner's own servers as part of nixie.** Their tools would skip pinning and effect
  declarations, and the rule engine could not match on them.
- **Build the proxy in the first build.** No outside server is planned for it.

## Consequences

- The platform encodes no special handling for tools that start or message other agents. Their
  effects are declared like any other, and the owner's rules decide them. With no matching rule, a
  call asks, under 0004.
- Judging taint by output field waits for the per-run taint stage in [0015](./0015-taint-scope.md),
  because the conversation is always untrusted.
