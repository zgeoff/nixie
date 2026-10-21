# The MCP proxy

- Decisions: [0017](../../../decisions/0017-mcp-proxy.md),
  [0021](../../../decisions/0021-action-outcomes.md),
  [0030](../../../decisions/0030-connectors-and-sandbox-environments.md)

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
sits outside nixie's rules. The proxy reaches a server over HTTP from the host, and on every hop
resolves the host, refuses any [non-public address](web-fetch.md#non-public-addresses), and connects
to the address it checked. A server on a private network passes only when its configuration pairs
the server's host with an allowed address range, the hop goes to that host, and the resolved address
falls in that range.

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
for an external tool. The [MCP proxy spike](../../../../research/mcp-proxy-pin/README.md) ran these
rules.

### A changed tool in a running task

When a trusted server changes a tool's hash, or you allow a changed tool, every task run whose tool
list holds the tool takes the new form at its next step. In the transaction that moves the pin, the
proxy writes a tool-changed record to the inbox of each of those task runs. The next turn renders
the record as a change note that names the tool with its old and new hash, and the turn's tool list
holds the new form. **Why:** nixie keeps every skill version and can serve the one a task pinned,
but it holds no copy of a server's code, so every call after the change runs the new tool. A run
that kept the old form would show the model a description that the server no longer follows.

A step that is running keeps the form it loaded, because the tool list is fixed when its turn
starts. Each call it makes still reaches the server only under the latest listing. The proxy checks
the call's input against the current pinned input schema, so a call shaped for the old form returns
a schema error, and it checks each result against the current pinned output schema.

The next turn takes the new form with no list change notice from the proxy, because each turn starts
a CLI process that lists the tools again. The session records no tool list while every query turns
the system prompt's snapshot off. With the snapshot on, a resumed session sends the tool list it
recorded at its first request. The `tool-list` probe in the
[SDK contract suite](../../../../evals/sdk-contract/README.md) checks both cases.

A worker run keeps the form it started with for its whole life, because its turns run in one model
loop inside its caller's step. Its calls pass the same checks, and its caller takes the new form at
the caller's next step.

The conversation follows the same rule and keeps its session. Tools sit outside the system prompt,
so a changed tool costs one prompt-cache miss, where a persona change opens a
[new session](../../../architecture/core/conversation-turns.md#opening-a-new-session). One cache
miss per change matches the cost of a [skill reload](../skills.md#versions). A pending proposal for
the tool goes stale, as [the proposal](../policy/approvals.md#the-proposal) states.

### A failed listing

A listing fails when the server refuses the connection, returns an error, sends a listing the proxy
cannot parse, or gives no answer within 10 s by default. A stdio server whose imp fails to start
fails its listing the same way. A listing the server refuses as unauthorised goes to the credential
store instead, which refreshes and retries once, as [refresh](credentials.md#refresh) states, and
the tools then follow the credential's [status](credentials.md#statuses).

When a server fails its listing at the start of a task run, the run keeps the server's pinned tools,
and the model sees each one in the form you allowed. **Why:** a tool that vanishes reads to the
model as a missing capability, so the assistant could tell you only that it cannot help, and a run
that hid the tools would keep the gap after the server recovers. The run's tool list stays the same
through the failure, which keeps the model's prompt cache.

A call to one of those tools reaches the server only when the proxy's latest listing of that server
passed and left that tool exposed under the table's rules, so a server cannot dodge the hash check
by failing its listing. When the latest listing failed, a call makes the next try itself once that
try is due, and lists the server before it calls the tool. A call whose listing fails, or that comes
before the next try is due, returns an error that names the server and the next try, such as "atc is
unreachable, next try 14:05".

The proxy keeps one health state per server, shared by every task run. Failed listings back off as a
poll does in the [trigger source](../channels/trigger-source.md#polls), from 1 min to 1 h by
default, and the proxy makes each try on that schedule with no task run waiting on it, unless a call
makes the try first. A listing a call makes counts toward the backoff and the health state like any
other. A task run that starts during the backoff skips the listing. After 3 failed listings in a
row, by default, the server is unhealthy.

The client shows one notice when the server becomes unhealthy, with the last error and the next try,
and one notice when an unhealthy server passes a listing again. It never shows a notice per task
run, because a server that is down for an hour would otherwise fill the client with one notice per
task run, while the model's error covers each call.

## Effect declarations

Every proxied tool needs an effect declaration before the model sees it, from you or a reviewed
starter set. The server's annotations only pre-fill the form, and a form with no annotations starts
from the strictest effects. The decision point denies a tool with no declaration, so a gap fails
closed. A declaration may name a check or an idempotency key for reconciliation. Otherwise an
interrupted call with side effects comes to you.

## Calls and results

A call to a proxied tool runs the same steps as any of [nixie's tools](tools.md), then calls the
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
token issued for anything else. The tokens live in the [credential store](credentials.md) with the
server's host as their only host. Your Google or Microsoft tokens never travel to an MCP server. A
deployment reachable only on a private network cannot publish client metadata, so you pre-register a
client with the server's authorization server.
