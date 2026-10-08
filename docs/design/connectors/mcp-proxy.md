# The MCP proxy

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md), [0004](../../decisions/0004-rule-engine.md),
  [0007](../../decisions/0007-grants-and-taint.md), [0015](../../decisions/0015-taint-scope.md),
  [0017](../../decisions/0017-mcp-proxy.md), [0021](../../decisions/0021-outside-action-outcomes.md)

Every MCP server outside nixie's code, the owner's own included, reaches the model only through
nixie's proxy, under [0017](../../decisions/0017-mcp-proxy.md). nixie acts as the MCP client, and
each of the server's tools becomes one of nixie's tools, with a pinned hash, an effect declaration
from the owner, and a name prefixed with the server's identifier. The proxy arrives with the first
outside server nixie uses, which is atc under the [coding adapter](./coding.md#the-atc-adapter).
Everything in this doc beyond the decisions it links is a proposal.

## Adding a server

The owner adds a server in the client, which records:

| Field     | Holds                                                                  |
| --------- | ---------------------------------------------------------------------- |
| ID        | A short slug, such as `atc`, which prefixes every tool name            |
| Transport | A Streamable HTTP URL, or a command that runs over stdio               |
| Trusted   | Whether a changed tool applies with a notice instead of stopping       |
| Auth      | None, a static token in the credential store, or OAuth for this server |

Adding a server is a widening, because its tools can join rules, so it asks once. Marking a server
trusted is a widening too. Removing a server, or clearing its trusted mark, narrows and applies at
once.

A server over stdio runs as a command in an imp from the [sandbox adapter](./sandbox-adapter.md),
with egress `none` and no grants by default, because its code is outside nixie's rules and may read
untrusted content, under [0007](../../decisions/0007-grants-and-taint.md). A server over HTTP is
reached from the host, and the proxy refuses private, loopback and link-local addresses unless the
server's URL names one, which guards against a server whose metadata points nixie at a private
address.

## Pinning

The proxy lists a server's tools when it connects, when the server sends
`notifications/tools/list_changed`, and at the start of every run whose tool list holds one of the
server's tools. For each tool, it hashes a canonical JSON form, with sorted keys, of the tool's
name, title, description, input schema, output schema and annotations. The hash leaves out `_meta`,
which carries data for the client, not for the model. **Why:** the description and the schemas are
what the model reads and what the owner reviewed, and a change to any of them can steer the model or
move a destination argument.

| Change                     | Untrusted server               | Trusted server         |
| -------------------------- | ------------------------------ | ---------------------- |
| Same hash                  | Exposed                        | Exposed                |
| Changed hash               | Stopped until the owner allows | Applied, with a notice |
| New tool                   | Hidden until declared          | Hidden until declared  |
| Removed tool               | Dropped, with a notice         | Dropped, with a notice |
| Declaration no longer fits | Stopped                        | Stopped                |

A declaration no longer fits when an argument it names, such as a destination, is missing from the
tool's current input schema. The proxy stops such a tool even on a trusted server, because the
decision point would read the wrong argument as the destination. The owner allows a changed tool in
the client, which shows the old and new form side by side, and allowing it pins the new hash.

The [MCP proxy spike](../../../spikes/mcp-proxy-pin/README.md) ran this rule over a local server on
the v2 MCP packages:

- A changed description, a renamed destination argument and a change to annotations alone each
  stopped the tool on an untrusted server.
- A new tool stayed hidden on both kinds of server, and a removed tool was dropped with its pin, so
  a tool that returns later counts as new.
- On a trusted server, the renamed destination argument applied with a notice, and the tool still
  stopped, because its declaration named the old argument. The proxy therefore checks every
  declaration against the schema on every listing, not only when a hash changes.

No hash catches a server that changes what a tool does without changing its listing. Pinning guards
what the model reads and what the decision point matches on, and the effect declaration, which
assumes the worst for an outside tool, guards the rest.

The proxy connects with the v2 client in `auto` mode, which negotiated 2026-07-28 with a v2 server
and fell back to 2025-11-25 with a v1 server in the spike. The client defaults to the older mode, so
the proxy sets `auto` explicitly. Over stdio, `auto` probes with a short-lived extra process, so a
server over stdio starts twice on each connect.

## Effect declarations

Every proxied tool needs an effect declaration before the model sees it, made by the owner or taken
from a reviewed starter set, under 0017. The server's annotations at most pre-fill the form, and the
defaults in the MCP spec treat an unannotated tool as destructive and open-world, so a form with no
annotations starts from the strictest effects. The decision point denies a tool with no declaration
at its first stage, so a gap in the proxy fails closed.

A declaration may name a check for reconciliation, as
[outside actions](../core/outside-actions.md#reconciliation-per-connector) describes, and otherwise
an interrupted call to a proxied tool with side effects goes to the owner, under
[0021](../../decisions/0021-outside-action-outcomes.md). A server that documents an idempotency key,
as atc does, lets the declaration name it.

## Calls and results

A call to a proxied tool runs the same steps as any of nixie's tools, from
[tools](./tools.md#a-tool-definition), and then calls the server's tool with the unprefixed name.
Every field of the result is outside content. The proxy checks `structuredContent` against the
pinned output schema, and a result that fails the check reaches the model as an error. The v2 client
checks results by default, against the server's latest listing rather than the pinned one, so the
proxy turns the client's check off and runs its own. In the spike, the proxy's check refused a
result whose number field held a string. Taint by output field, which the endorsed types of the
[decision point](../policy/decision-point.md#taint-in-the-first-build) would allow, waits for taint
per job run under [0015](../../decisions/0015-taint-scope.md).

A server that needs the owner's input returns an input request, under the 2026-07-28 revision, or an
`input_required` task status under the tasks extension. The proxy renders the request to the owner
in the client, outside the model, ends the turn, and retries the call with the owner's answer as its
own step. **Why:** the request's text is untrusted content that can ask the owner for anything, and
rendering it outside the model keeps it out of the conversation. The v2 client answers input
requests itself unless the proxy sets `inputRequired: { autoFulfill: false }`, so the proxy sets it.

The proxy declares no sampling, roots or logging capability, which the 2026-07-28 revision
deprecates, so a server cannot ask nixie's model for anything.

## Authorization

The proxy follows the client side of the MCP authorization spec
([authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)):
each token carries the server's canonical URI as its resource under RFC 8707, and the proxy never
sends a server a token issued for anything else. The tokens live in the
[credential store](./credentials.md) as any other OAuth token, with the server's host as their only
host. The owner's Google or Microsoft tokens belong to nixie's own connectors and never travel to an
MCP server.

A deployment reachable only on a tailnet cannot publish a Client ID Metadata Document that the
authorization server fetches, so the owner pre-registers a client with the server's authorization
server, and setup follows the [connector steps](./connector.md#setting-up-a-connection).
