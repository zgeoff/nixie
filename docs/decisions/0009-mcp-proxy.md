# 0009: External MCP servers reach the model only through nixie's proxy

- Date: 2026-10-08
- Status: decided

## Decision

An external server is any MCP server that is not part of nixie's own code, whoever wrote it. Your
own servers count, because nixie's rules cannot see inside them. Every external server reaches the
model only through a nixie proxy, as [0002](0002-approvals.md) requires: nixie acts as the MCP
client, and the model never connects to the server.

A sandbox adapter that nixie ships, such as the imp adapter, is part of nixie and follows nixie's
own rules. An MCP server you give nixie, such as one that manages your own imp server, is an
external server, even when it manages the same kind of system.

## Why

- Authorship does not make a server's behaviour visible to nixie's rules. The MCP spec states that
  "clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers"
  ([MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- The rule engine from [0004](0004-rule-engine.md) needs declared effects to decide anything, so
  trust in a server never removes them.

## Rejected alternatives

| Option                                  | Why not                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| treat your own servers as part of nixie | Their tools would skip effect declarations, and the rule engine could not match on them. |

## Consequences

- The platform encodes no special handling for tools that start or message other agents. Their
  effects are declared like any other, and your rules decide them.
