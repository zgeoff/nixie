# The MCP proxy

- Decisions: [0017](../../decisions/0017-mcp-proxy.md),
  [0021](../../decisions/0021-outside-action-outcomes.md),
  [0030](../../decisions/0030-connectors-and-sandbox-environments.md)

Every external server, your own included, reaches the model only through nixie's proxy. nixie is the
MCP client, and each of the server's tools becomes one of nixie's tools, with a pinned hash, an
effect declaration you make, and a name prefixed with the server's ID. The proxy uses the v2
TypeScript MCP client and arrives with the first external server, which is atc.

## Adding a server

| Field     | Holds                                                            |
| --------- | ---------------------------------------------------------------- |
| ID        | A short slug, such as `atc`, which prefixes every tool name      |
| Transport | A Streamable HTTP URL, or a command that runs over stdio         |
| Trusted   | Whether a changed tool applies with a notice instead of stopping |
| Auth      | None, a static token in the credential store, or OAuth           |

Adding a server and marking it trusted are widenings, so each asks once. Removing a server or
clearing its trusted mark narrows and applies at once.

A server over stdio runs as a command in an imp with egress `none` and no grants, because its code
sits outside nixie's rules. The proxy reaches a server over HTTP from the host, and refuses private,
loopback and link-local addresses that the server's URL does not name.

A server whose backend runs outside the sandbox connects as an HTTP server with an OAuth grant whose
scopes limit the tools nixie can call. The deployment configures the URL and registers nixie as a
client, and you revoke the grant at the server. atc is the first case, through `atc mcp --http`.
**Why:** `atc mcp` over stdio talks to atc's daemon on a socket that checks no credential, so
forwarding that socket into an imp, or running the server on the host, hands nixie full control of
every session.

## Pinning

The proxy lists a server's tools when it connects, when the server reports a changed list, and at
the start of every task run whose tool list holds one of the server's tools. It hashes a canonical
JSON form of each tool's name, title, description, input schema, output schema and annotations,
leaving out `_meta`. **Why:** the description and schemas are what the model reads and what you
reviewed.

| Change                     | Untrusted server        | Trusted server         |
| -------------------------- | ----------------------- | ---------------------- |
| Same hash                  | Exposed                 | Exposed                |
| Changed hash               | Stopped until you allow | Applied, with a notice |
| New tool                   | Hidden until declared   | Hidden until declared  |
| Removed tool               | Dropped, with a notice  | Dropped, with a notice |
| Declaration no longer fits | Stopped                 | Stopped                |

A declaration no longer fits when an argument it names, such as a destination, is missing from the
current input schema, so the proxy checks every declaration on every listing. The client shows a
changed tool's old and new form side by side, and allowing it pins the new hash. A server can still
change what a tool does without changing its listing, so the effect declaration assumes the worst
for an external tool. The [MCP proxy spike](../../../spikes/mcp-proxy-pin/README.md) ran these
rules.

## Effect declarations

Every proxied tool needs an effect declaration before the model sees it, from you or a reviewed
starter set. The server's annotations only pre-fill the form, and a form with no annotations starts
from the strictest effects. The decision point denies a tool with no declaration, so a gap fails
closed. A declaration may name a check or an idempotency key for reconciliation. Otherwise an
interrupted call with side effects comes to you.

## Calls and results

A call to a proxied tool runs the same steps as any of [nixie's tools](./tools.md), then calls the
server's tool. Every result field is outside content. The proxy checks `structuredContent` against
the pinned output schema, so it turns off the v2 client's own check, which uses the latest listing.

An input request from a server reaches you in the client, outside the model, and the proxy retries
the call with your answer as its own step. **Why:** the request's text is untrusted and can ask for
anything. The proxy sets `inputRequired: { autoFulfill: false }` and declares no sampling, roots or
logging capability, so a server can never use nixie's model.

## Authorization

The proxy follows the client side of the
[MCP authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):
each token names the server's canonical URI as its resource, and the proxy never sends a server a
token issued for anything else. The tokens live in the [credential store](./credentials.md) with the
server's host as their only host. Your Google or Microsoft tokens never travel to an MCP server. A
deployment reachable only on a private network cannot publish client metadata, so you pre-register a
client with the server's authorization server.
