# MCP and nixie's own interfaces

Report: 2.6

Sources were fetched on 2026-10-08 unless a different date is given with the source.

The Model Context Protocol (MCP) covers tools, resources, prompts, elicitation and, through official
extensions, long-running tasks. Its latest revision, 2026-07-28, made the protocol stateless and
replaced server-initiated requests with a retry that carries the owner's input, which suits a
proposal that ends the turn under [decision 0002](../../decisions/0002-approvals.md). MCP has no
final interface for event triggers, chat channels or brokering credentials for a host's own
connectors, so nixie would need its own interfaces for those 3. A proxy for third-party MCP servers
fits the protocol: the spec tells clients to treat tool annotations from untrusted servers as
untrusted, and `outputSchema` lets nixie judge taint by the types a tool returns. The authorization
rules forbid token passthrough and bind each token to one MCP server through RFC 8707, so the
owner's tokens for Google or Microsoft never reach a third-party server.

## The 2026-07-28 revision

The latest stable revision is 2026-07-28, released on 28 July 2026 after a release candidate on 29
May 2026 ([spec releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases)).
The revisions before it are 2025-11-25, 2025-06-18 and 2025-03-26. The
[2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) lists
these major changes:

- **No sessions.** SEP-2567 removes protocol-level sessions and the `Mcp-Session-Id` header. A
  server mints a state handle and passes it as an ordinary tool argument. A specification
  enhancement proposal (SEP) is the protocol's change process.
- **No handshake.** SEP-2575 removes `initialize`. Every request carries its protocol version and
  client capabilities in `_meta`, and a server must answer the `server/discover` call with its
  versions, capabilities and identity.
- **One subscription stream.** `subscriptions/listen` replaces the HTTP GET stream and
  `resources/subscribe`, with opt-in filters for list changes and resource updates.
- **Multi round-trip requests.** SEP-2322 replaces server-initiated requests, such as
  `elicitation/create`, `sampling/createMessage` and `roots/list`. The server returns an
  `InputRequiredResult` with `inputRequests`, and the client retries the original request with
  `inputResponses` and any `requestState` the server sent.
- **Tasks leave the core.** SEP-2663 moves tasks into the extension `io.modelcontextprotocol/tasks`.
- **Deprecations.** Roots, sampling and logging are deprecated (SEP-2577), as are the HTTP+SSE
  transport and Dynamic Client Registration. A deprecation lasts at least 12 months.

The revision also lets `inputSchema` and `outputSchema` use any JSON Schema 2020-12 keyword, and
lets `structuredContent` be any JSON value (SEP-2106). It binds client credentials to the
authorization server that issued them (SEP-2352), and requires clients to validate the `iss`
parameter from RFC 9207 (SEP-2468).

The TypeScript SDK splits along the revision. `@modelcontextprotocol/sdk` 1.32.1 implements the spec
up to 2025-11-25, and its README states that 2026-07-28 support "is not planned for v1.x"
([TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)). The v2 packages
`@modelcontextprotocol/client`, `/server` and `/core` are at 2.3.1, released 5 October 2026, and
implement 2026-07-28. A v2 client speaks both eras: by default it sends the 2025 `initialize`, and
`mode: 'auto'` probes with `server/discover` and falls back
([protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions.html)). A proxy in
nixie meets servers of both eras, so the fallback matters.

## Features and their status

The [SEP index](https://modelcontextprotocol.io/community/seps) lists 42 final SEPs. The spec index
for 2026-07-28 lists elicitation as the only client feature, and tasks, skills and MCP Apps as
extensions ([spec index](https://modelcontextprotocol.io/specification/latest)).

| Feature                      | Status in 2026-07-28                         | Source                                                                                                          | Use to nixie                                    |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Tools                        | Core                                         | [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)                                  | Proxied as nixie tools                          |
| `structuredContent`, schemas | Core, loosened by SEP-2106                   | [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)                                  | Return-type taint                               |
| Tool annotations             | Core, hints only                             | [schema.ts](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts) | Display only                                    |
| Elicitation, form and URL    | Core, delivered by multi round-trip requests | [Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)                      | Becomes a proposal or an owner question         |
| Tasks                        | Official extension, SEP-2663 final           | [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview)                                    | Long third-party calls on nixie's durable layer |
| Sampling, roots, logging     | Deprecated, SEP-2577                         | [Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)                                 | Refuse                                          |
| Resource updates             | Core, through `subscriptions/listen`         | [Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)                                 | A weak trigger source                           |
| Events                       | Open proposal, SEP-3415                      | [PR 3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)                               | None until final                                |
| Extensions mechanism         | Final, SEP-2133                              | [Extensions](https://modelcontextprotocol.io/extensions/overview)                                               | Off by default                                  |
| MCP Apps                     | Official extension, SEP-1865 final           | [ext-apps](https://github.com/modelcontextprotocol/ext-apps)                                                    | Out of scope for chat channels                  |
| Server Cards                 | Extension, SEP-2127 final                    | [SEP-2127](https://modelcontextprotocol.io/seps/2127-mcp-server-cards)                                          | Discovery before connecting                     |
| Registry                     | Preview, API frozen at v0.1, release v1.8.1  | [Registry](https://github.com/modelcontextprotocol/registry)                                                    | Discovery only                                  |

Tasks fit nixie's durable layer. A server that sees the client declare the tasks extension can
answer a call with `CreateTaskResult`, and the client polls with `tasks/get`, answers input with
`tasks/update` and cancels with `tasks/cancel`
([tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview)). Each poll is an
ordinary request, so a step in nixie's state machine from
[decision 0001](../../decisions/0001-durable-layer.md) can hold the task ID and poll on a durable
timer.

## Triggers, channels and brokering

MCP offers one route for an outside event: a client that opts in through `subscriptions/listen`
receives `notifications/resources/updated` for chosen resource URIs. The notification needs a stream
that the client holds open, carries no payload beyond the URI, and gives no replay after a
reconnect, since 2026-07-28 removed SSE resumability. A schedule, an email arriving or a webhook
from a service has no MCP form.

Events are in progress. A Triggers and Events Working Group was chartered in March 2026 (PR 2459).
SEP-3415, opened on 5 October 2026, proposes `io.modelcontextprotocol/events` with `events/list` and
delivery by poll, stream or a webhook signed under Standard Webhooks, with resumable cursors and no
SDK implementation
([SEP-3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)). SEP-2495,
event-driven tool invocation, has been open since March 2026. Neither is final.

Chat channels and credential brokering sit outside MCP's scope. MCP connects a model host to tool
servers; it does not describe how the owner reaches nixie, how nixie proves the owner's identity on
a channel, or how nixie keeps a refreshable token for Gmail. The table lists the interfaces nixie
needs beyond MCP.

| Interface        | What it carries                                                                                             | Nearest MCP piece                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Channel adapter  | Owner messages in, replies and pushes out, the owner's identity, approval buttons                           | None                                   |
| Trigger source   | Schedules, webhooks, mailbox pushes and polls, each as an event in nixie's log with a cursor                | Resource updates, SEP-3415 if it lands |
| Connector        | Typed calls to one outside service, with declared effects and a typed result                                | A tool, which nixie wraps              |
| Credential store | OAuth clients, refresh, rotation, and grants to imps under [0007](../../decisions/0007-grants-and-taint.md) | The client side of MCP authorization   |
| MCP proxy        | A third-party MCP server, pinned and wrapped as nixie tools                                                 | MCP client                             |

The [imp broker spike](../../spikes/imp-broker/) bears on the credential store. imp's broker injects
a static value and never refreshes, and a grant on a token endpoint hands the imp a live token. A
credential store would therefore refresh tokens on the host and push each new value into imp with
`imp secret add --replace`, unless imp takes refresh on.

## Proxying third-party MCP servers

Under [decision 0002](../../decisions/0002-approvals.md), a third-party MCP tool reaches the model
only as one of nixie's tools, so nixie acts as the MCP client and the model never connects to the
server. The proxy has 4 jobs: decide what each tool's effects are, decide whether each result
taints, hold the authorization, and turn the server's input requests into nixie's own approvals.

### Annotations

The spec treats annotations as untrusted. The 2026-07-28 tools page states that "clients **MUST**
consider tool annotations to be untrusted unless they come from trusted servers", and the schema
says that "Clients should never make tool use decisions based on `ToolAnnotations` received from
untrusted servers" ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools);
[schema.ts](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)).
The field names in 2026-07-28 are `title`, `readOnlyHint` (default false), `destructiveHint`
(default true), `idempotentHint` (default false) and `openWorldHint` (default true). This answers
the open question in the [policy model notes](../2.3-notes/policy-models.md#open-questions).

The defaults suit a proxy that has to guess: an unannotated tool reads as destructive and
open-world. The 2.3 notes list annotations as a source of effects worth avoiding. The owner, or a
reviewed starter set, could declare each proxied tool's effects, with the annotations at most
pre-filling that declaration.

SEP-1913, Trust and Sensitivity Annotations, is an open draft that adds `sensitiveHint`,
`privateHint`, `maliciousActivityHint` and `attribution` to data, with labels that only escalate as
data flows ([SEP-1913](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913)). It
describes the taint model from [decision 0005](../../decisions/0005-effects-and-taint.md) in
protocol terms, but from an untrusted server a label can only add taint, never remove it.

The tools page asks a proxy that aggregates servers to prefix tool names with a server identifier,
and not to rely on the server's own `name` for that.

### Typed outputs and taint

`structuredContent` gives nixie a typed result to judge. A server with an `outputSchema` "MUST
provide structured results that conform to this schema", and clients "SHOULD validate structured
results against this schema"
([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). A tool that
returns structured content "SHOULD also return the serialized JSON in a TextContent block", so the
proxy chooses which of the two reaches the model.

JSON alone does not make a result clean. A schema with a `summary: string` field carries free text
in a typed wrapper, and a search result's snippet is page text. Decision 0005's return-type rule can
apply field by field, by the schema's types:

| Schema field                                         | Taint                                     |
| ---------------------------------------------------- | ----------------------------------------- |
| boolean, number, integer                             | Clean                                     |
| `enum` or `const` whose values the owner reviewed    | Clean                                     |
| string with `format` `date-time`                     | Clean once nixie parses it as a date      |
| string with `format` `uri` or `email`                | Taints: the path or local part holds text |
| string with a `maxLength` and a `pattern`            | Taints: `^.{1,80}$` admits an instruction |
| any other string                                     | Taints                                    |
| no `outputSchema`, or a result that fails validation | Taints                                    |

The schema comes from the same untrusted server, which can change it. A server can also change a
tool's description after the owner approved it, a pattern that threat catalogues call a rug pull
([ATR-2026-00581](https://agentthreatrule.org/zh/rules/ATR-2026-00581), not opened). A proxy can pin
each tool's description, input schema and output schema by hash when the owner adds it, and treat a
changed hash as a new tool that needs the owner's review. CVE-2026-13341, in Kong Konnect MCP before
1.0.0, shows the injection path that the taint rule guards: analytics data in a tool result steered
the model into unintended API calls ([OSV](https://osv.dev/vulnerability/CVE-2026-13341)).

### Authorization

nixie as an MCP client follows the client side of the
[authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):

- **Audience binding.** Clients "MUST implement Resource Indicators for OAuth 2.0 as defined in RFC
  8707", include `resource` in both the authorization and token requests, and use "the canonical URI
  of the MCP server". Clients send it "regardless of whether authorization servers support it".
- **No passthrough.** Clients "MUST NOT send tokens to the MCP server other than ones issued by the
  MCP server's authorization server", and servers "MUST NOT accept or transit any other tokens". The
  [security best practices](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
  state that token passthrough "is explicitly forbidden".
- **Discovery.** Servers publish OAuth 2.0 Protected Resource Metadata (RFC 9728), and clients use
  it to find the authorization server.
- **Registration.** Clients and authorization servers "SHOULD support OAuth Client ID Metadata
  Documents". Dynamic Client Registration is deprecated, and pre-registration remains.

The rules give nixie a clean split. The owner's Google, Microsoft or Apple credentials belong to
nixie's own connectors and never travel to an MCP server. A third-party MCP server gets only a token
issued for its own canonical URI, which nixie's credential store keeps and refreshes like any other.
A Client ID Metadata Document needs a URL that the authorization server can fetch, which a
deployment behind a tailnet may not have; pre-registration then fills the gap.

When a third-party server needs the owner's access to another service, it asks through URL-mode
elicitation. The spec states that "The third-party credentials MUST NOT transit through the MCP
client", and the server keeps the tokens
([elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)). Form
mode must never ask for passwords, API keys or tokens. A proxy that shows the full URL to the owner
and opens it only with consent keeps the URL away from the model.

nixie also runs an MCP server: the endpoint on the host that a coding session inside an imp calls
under [decision 0003](../../decisions/0003-sdk-placement.md). The server side of the same rules
applies: validate that each token lists nixie's endpoint as its audience. The best practices page
replaces session hijacking with state handle hijacking: "MCP servers **MUST NOT** treat possession
of a state handle as authentication."

### Elicitation and approvals

A multi round-trip request suits a proposal. A third-party server that needs input returns
`InputRequiredResult`, which ends that call, and the client retries later with `inputResponses`. The
proxy can record the input request, end the turn under decision 0002, and retry the call as its own
step once the owner answers. The spec says nothing on how long a server keeps `requestState` valid,
so a retry hours later may fail. Under the tasks extension, the same request arrives as an
`input_required` task status that nixie answers with `tasks/update`.

An input request from a third-party server is untrusted content. Its message text taints the main
thread if the proxy passes it to the model, and it can ask the owner for anything. A proxy that
renders the request straight to the owner, outside the model, avoids the taint.

### Other server risks

The security best practices page covers server-side request forgery (SSRF) for clients that run on a
server: such clients "MUST consider SSRF risks", and should block private and link-local ranges and
use an egress proxy. A proxy on nixie's host fetches metadata URLs that a server names, so the same
rule applies to it. The page also covers local MCP servers started over stdio, which run as a
command on the host; under [decision 0007](../../decisions/0007-grants-and-taint.md), a local server
that reads untrusted content belongs inside an imp with no grants.

## Worth borrowing

- multi round-trip requests, which map an input request onto a proposal that ends the turn
- the tasks extension's poll, update and cancel calls, as the shape of a long third-party call
- `outputSchema` as the source of field types for the return-type taint rule
- RFC 8707 audience binding and the ban on token passthrough, applied to every outside token nixie
  holds
- SEP-3415's event shape, with cursors and Standard Webhooks signatures, as a reference for nixie's
  trigger source
- tool name prefixes per server, from the tools page

## Worth avoiding

- tool annotations as a source of effects or taint
- treating `structuredContent` as clean because it is JSON
- sampling and roots, which 2026-07-28 deprecates and which hand the model's context to a server
- the v1 TypeScript SDK, which never implements 2026-07-28
- a Dynamic Client Registration flow, which the spec deprecates

## Recommendations

- **Define 4 interfaces of nixie's own, and take tools from MCP.** A channel adapter, a trigger
  source, a connector and a credential store have no MCP counterpart. Building them costs design
  work now. Waiting for MCP events would leave triggers on an open proposal, and nixie can add an
  adapter for SEP-3415 if it becomes final.
- **Proxy third-party MCP servers through a pinning wrapper.** The owner adds a server, nixie
  records each tool's hashed description and schemas, the owner declares effects, and a changed hash
  asks again. The trade-off is a review step for every server update.
- **Judge taint by the output schema's field types.** Booleans, numbers, enums whose values the
  owner reviewed, and dates that nixie parses stay clean. Any other string taints, URLs and
  patterned strings included, because each can hold an instruction. The cost is that most
  third-party tools, which return free text, taint until someone writes a typed wrapper.
- **Use the v2 TypeScript SDK client in `auto` mode.** It reaches servers of both eras. The cost is
  following a fast-moving v2 line.
- **Keep connectors for the owner's own accounts as nixie code, not as MCP servers.** The owner's
  tokens then never leave nixie's host. The cost is writing connectors that community MCP servers
  already offer.

## Proposed spikes

- **A pinning MCP proxy.** Wrap one public server that speaks 2026-07-28 and one older server with
  the v2 TypeScript client in `auto` mode, record each tool's hashed description and schemas, and
  check whether `structuredContent` conforms to `outputSchema`. Change a description on a local
  server to see the proxy flag it. It also checks which revision the Agent SDK's in-process MCP
  server speaks. About half a day.
- **An input request across a restart.** Have a local server return `InputRequiredResult`, end the
  turn, restart nixie's stand-in, and retry with `inputResponses` an hour later, to see whether
  `requestState` survives. About 2 hours.

## Open questions

- Which MCP revision does the Agent SDK's in-process MCP server speak, and does it pass
  `structuredContent` and `outputSchema` through to nixie's tools? The notes did not check.
- Does the v2 TypeScript client validate `structuredContent` against `outputSchema` itself? The
  notes did not find it stated.
- How long do servers keep `requestState` valid for a retry? The spec states no limit, so a proposal
  that waits hours may need the call restarted.
- Does SEP-1913 or SEP-3415 become final, and when?
- Which deployments can publish a Client ID Metadata Document URL, given a deployment reachable only
  on a tailnet?
