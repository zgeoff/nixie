# The MCP proxy build

- **Status:** draft
- **Work items:** [the proxy](https://linear.app/zgeoff/issue/GEO-1842), which needs
  [one marker for outside text](https://linear.app/zgeoff/issue/GEO-2836). Two items build on it:
  [a changed tool in a running task](https://linear.app/zgeoff/issue/GEO-1254) and
  [the pin in the action hash](https://linear.app/zgeoff/issue/GEO-1255).
- **Decision records:** [0009](../../decisions/0009-mcp-proxy.md)

The assistant uses the tools of an outside MCP server through nixie's proxy. Each tool takes the
name `<serverID>.<tool>`, a pinned form and an effect declaration you approve. Each call passes the
decision point like any of nixie's tools, its result reaches the model marked as outside text, and
the server's credential never leaves the host. The first build serves 2 HTTP servers of your own: a
work tracker and a delivery-metrics server.
[The MCP proxy design](../platform/connectors/mcp-proxy.md) sets the rules for pins, failed listings
and declarations, and this design adds the contracts that build them.

## Shape

```mermaid
flowchart LR
  config["mcp.servers in config.yaml"] -->|"a widening: one proposal"| facts[server facts]
  facts --> lister[server listing]
  lister -->|"hash each tool form"| pins[(pins)]
  pins -->|"exposed and declared"| registry[tool registry]
  registry --> endpoint[task run's tool endpoint]
  endpoint -->|"decision point"| call[proxy call]
  call -->|"credential store fetcher"| server[MCP server]
  server -->|"result, marked untrusted"| endpoint
```

## Terms

- A **server listing** is one MCP `tools/list` of one server.
- A **tool form** is one tool as a server listing returns it, in canonical JSON.
- A tool's **pin** is the hash of the tool form you reviewed. The proxy exposes the tool in that
  form only.

## The first two servers

Both servers serve Streamable HTTP at `/mcp` behind an OAuth server that takes service clients. A
service client sends its ID, `service:<name>`, and its secret to the token endpoint with the
`client_credentials` grant, and gets a short-lived access token with no refresh token. Both servers
refuse a static bearer token. The deployment's private config names their hosts.

| Server           | ID in this doc | Scopes the service client holds                              | Tools                     |
| ---------------- | -------------- | ------------------------------------------------------------ | ------------------------- |
| Work tracker     | `tracker`      | `read`; `write` waits on [an open question](#open-questions) | work items and the runner |
| Delivery metrics | `metrics`      | `read`                                                       | reads only                |

## Contracts

### The config

```yaml
# config.yaml: the mcp section, which the mcp module's schema owns
mcp:
  listingTimeoutSeconds: 10 # the default
  servers:
    tracker: # the server ID, which prefixes every tool name
      url: https://tracker.example.internal/mcp # https, with no user name, query or fragment
      auth:
        kind: service_client # the only kind this build accepts
        tokenURL: https://tracker.example.internal/oauth2/token # the same origin as url
        clientID: service:nixie
        secret: deployment:tracker_mcp # a connector_credentials entry
        scope: read # the scopes asked for, space-separated
      trusted: false # the default
      privateRange: null # a CIDR range when the host resolves to a non-public address
```

- A server ID matches `^[a-z][a-z0-9]{1,15}$`. The config load refuses an ID that equals the first
  segment of a tool nixie registers, such as `memory` or `task`.
- `privateRange` is one CIDR range. The load refuses a range that holds a loopback, link-local or
  unspecified address, except in a test build (`NIXIE_TEST_BUILD`).

### The service client credential

```ts
// credentials module: a spec kind for an MCP server's service client. The file backend holds the
// secret; the store holds the access token.
const binding = store.register(
  resolveCredential({ class: 'connector', reference: 'deployment:tracker_mcp' }),
  {
    kind: 'service_client', // …existing kinds
    label: 'MCP: tracker',
    origins: ['https://tracker.example.internal'],
    serviceClient: {
      tokenURL: 'https://tracker.example.internal/oauth2/token',
      clientID: 'service:nixie',
      scope: 'read',
      resource: 'https://tracker.example.internal/mcp', // sent with every token request
    },
  },
);
const fetch = store.fetcher(binding, ['https://tracker.example.internal'], {
  redirects: 'none',
  pairing: null, // { host, range } from privateRange
});
```

- The store exchanges the secret for an access token at the first request, with
  `client_secret_basic`, and holds the token in process memory only. A restart forgets it.
- The fetcher sends the token as `Authorization: Bearer` on every request except the one to
  `tokenURL`.
- When the token's `expires_in` has passed, the store exchanges again before the request.
- When the server answers 401, the store exchanges once more and resends the request once. A second
  401 fails the request as `unauthorised`.
- The fetcher removes both the secret and the token from every response and error, as it removes a
  static value.

### Server facts and approvals

The config holds the facts the deployment asks for, and records hold the facts in use. At each
start, the proxy compares each config entry with the server's facts in use:

| The entry against the facts in use                                                            | What the start does                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| the same                                                                                      | nothing                                                |
| new, or a new URL, client ID or secret reference, more scopes, a wider range, or `trusted` on | holds the server and writes one proposal               |
| fewer scopes, a narrower range, or `trusted` off                                              | applies the change with an `mcp.server_changed` record |
| gone from the config                                                                          | sets the server `removed`, and keeps its pins          |

```ts
// mcp module: the facts in use, folded from records into the mcp_servers projection
interface ServerFacts {
  url: string;
  auth: {
    kind: 'service_client';
    tokenURL: string;
    clientID: string;
    secret: string;
    scope: string;
  }; // secret: the reference
  trusted: boolean;
  privateRange: string | null;
}

type ServerState = 'held' | 'added' | 'removed'; // held: waits for the proposal of its widened facts

// mcp module: the operation of an mcp proposal, whose SHA-256 is the proposal's action hash
type McpOperation =
  | { change: 'server'; serverID: string; facts: ServerFacts }
  | { change: 'declare'; tool: string; hash: string; declaration: ToolDeclared['declaration'] }
  | { change: 'allow'; tool: string; fromHash: string; hash: string }; // allow a changed tool
```

- Every widening is one proposal of family `mcp` on the proposals core, of kind `internal_change`.
  Its "same thing" key is the server ID for `server` and the tool name for `declare` and `allow`, so
  a newer proposal for the same server or tool replaces the open one.
- A `server` proposal is always-ask, so you approve it with the passkey. A `declare` or an `allow`
  proposal is routine.
- The `mcp` handler recomputes the operation from the current facts and the tool's latest hash at
  each answer, so an answer from a card that showed older facts or an older tool form fails as
  `CONFLICT`.

### Pins

```ts
// mcp module
const hash = hashToolForm(toolForm); // → 'sha256:3b9f…'

// Canonical JSON, serialised as the snapshot form is: sorted keys, no whitespace, NFC strings
interface ToolForm {
  name: string; // the server's name for the tool, before the prefix
  title: string | null;
  description: string | null;
  inputSchema: JSONObject;
  outputSchema: JSONObject | null;
  annotations: JSONObject | null; // _meta is left out
}

type PinState =
  | 'exposed'
  | 'stopped_changed' // an untrusted server changed the tool; waits for an allow
  | 'stopped_unfit' // the declaration names an argument the latest input schema lacks
  | 'hidden_new' // no declaration yet, or a name the model cannot read
  | 'removed'; // the latest server listing lacks the tool
```

```text
mcp_tools, a projection, one row per tool a server listing has held
  tool          text primary key  -- '<serverID>.<tool>', such as 'tracker.item_get'
  server_id     text not null
  pinned_hash   text              -- null until a declaration pins the tool
  latest_hash   text not null     -- the hash in the newest passed server listing
  state         text not null     -- a PinState
  declared_seq  integer           -- the mcp.tool_declared record in force

mcp_tool_forms, a projection, one row per tool form a server listing has held
  hash          text primary key
  listed_seq    integer not null  -- the mcp.tool_listed record whose erasable fields hold the form
```

- An approved `declare` or `allow` moves the pin to the hash its operation holds, never to a later
  one. A trusted server's change moves the pin to the hash in the server listing that brought it.
- A stopped tool stays on each tool list in its pinned form. A call to it returns an error such as
  "tracker.item_get changed and waits for your review". A hidden or removed tool is on no tool list.

### Names

- A proxied tool's name is `<serverID>.<tool>`, such as `tracker.item_get`. Rules, task definitions
  and `nixie mcp` name it so, and `tracker.*` matches every tool of the server.
- The model reads `mcp__nixie__tracker_item_get`, from the existing `toSDKToolName`.
- The proxy keeps a tool `hidden_new`, with the reason in `nixie mcp tools`, when the server's name
  falls outside `^[A-Za-z0-9_-]{1,64}$`, when its model name passes 64 characters, or when another
  tool already holds its model name.
- The prefix never changes while the server ID stays. A server that renames a tool lists a new tool,
  so a rule that named the old one matches nothing until you edit it.

### Effect declarations

```yaml
# item_create.yaml, the file for: nixie mcp declare tracker.item_create --file item_create.yaml
effects: [write]
destinations: [] # argument names that hold a destination
amount: null # the argument that holds the amount of a spend
content: [title, body] # free-text arguments
reconcile: null # or { idempotencyKey: <argument> } or { check: <read tool> }; null brings an
# interrupted queued call to you
```

```ts
// mcp module: the record a declaration writes
interface ToolDeclared {
  // kind mcp.tool_declared
  tool: string;
  declaration: Omit<EffectDeclaration, 'results'>; // EffectDeclaration: policy module
  reconcile: { idempotencyKey: string } | { check: string } | null;
  pinnedHash: string; // the tool form this declaration was approved against
  proposalID: string | null; // null for a narrowing, which applies with no proposal
}
```

- `nixie mcp declare --prefill <tool>` prints a file from the latest form's annotations:
  `readOnlyHint: true` gives `[read]`, and `destructiveHint: false` drops `delete`. With no
  annotations it gives `[write, delete, send]`. Only the declaration you approve counts.
- A declaration that only adds an effect, a destination, the amount or a content argument, or only
  removes its `reconcile`, narrows and applies at once. Every other change is a `declare` proposal.
- The declaration's `results` maps every field of the output to `untrusted`, and nobody declares it.
- The [snapshot hash](../platform/policy/rules.md#the-snapshot-hash) covers each proxied tool's
  declaration in force and its pin.

### The registry

```ts
// tools module: a second source of tool definitions, which the composition root passes in. The mcp
// module provides it.
interface ToolSource {
  findTool(name: string): RegisteredTool | null; // reads the pins at each call
  // Lists each server the names reach before the task run's first step reads its tool list. It
  // never rejects: a failed server listing leaves the pinned tools in place.
  prepareTaskRun(tools: readonly string[]): Promise<void>;
}

declare function buildToolRegistry(
  definitions: readonly ToolDefinition[], // …existing
  sources: readonly ToolSource[], // nixie's own tools win a name
): ToolRegistry;
```

```ts
// mcp module: the definition of an exposed or stopped tool, built from its pinned form
const definition: ToolDefinition = {
  name: 'tracker.item_get',
  description: pinned.description ?? '',
  input: pinned.inputSchema,
  output: pinned.outputSchema ?? { type: 'object', properties: { text: { type: 'string' } } },
  declaration, // from mcp.tool_declared, with every result untrusted
  execution: 'direct', // 'queued' when hasQueuedEffect(declaration.effects)
  run: callServerTool,
};
```

- A tool whose pinned form has no output schema returns `{ text }`: the result's text blocks joined
  by a blank line. Image blocks go back as the result's images, under the turn's image caps. The
  proxy drops every other block kind, and `text` ends with a line that counts them.
- A pinned output schema that is not an object keeps the tool `hidden_new`.

### Calls and the untrusted markers

```ts
// tools module: the endpoint's answer to a call whose result record's source is untrusted, which
// is every proxied call. renderFenced: libs/wire, from the fence work item.
const answer: CallToolResult = {
  content: [
    { type: 'text', text: renderFenced('tool-result', 'untrusted', JSON.stringify(result)) },
    ...images, // image blocks, after the text
  ],
  isError: false, // true for a server's isError result, whose text is fenced the same way
};
// text → '<tool-result source="untrusted" fence="3f9a0c21b7de">\n{"items":[…]}\n</tool-result fence="3f9a0c21b7de">'
```

- The endpoint never sends `structuredContent` for a proxied tool, because the model would read it
  without the markers.
- A queued proxied call's result reaches the task through the inbox, which wraps it in the same
  markers as every action result.
- The MCP client runs in `auto` protocol mode, with no sampling, roots, logging or input-request
  capability, and with its own output check off. The proxy checks each result against the pinned
  output schema.
- The proxy sends each request to the configured URL alone, through the fetcher, with no redirect,
  `Origin` header or cookie.

### Health

```ts
// mcp module: one state per server, in memory, shared by every task run
interface ServerHealth {
  failures: number; // failed server listings in a row
  nextTryAt: Date | null; // the backoff from libs/retry, 1 min to 1 h, while failures > 0
  isUnhealthy: boolean; // failures >= 3
  lastError: 'refused' | 'error' | 'unparsable' | 'timeout' | 'unauthorised' | null;
}
// mcp.health_changed { serverID, isUnhealthy, lastError, nextTryAt }: one when the server becomes
// unhealthy, one when it recovers. The web client shows each in its server list.
```

- While the latest server listing of a server failed, a call to its tool returns "tracker is
  unreachable, next try 14:05", in the time zone the time tool answers in.
- A start resets every server's health.

### A changed tool

```ts
// mcp module: an inbox record, one per task per tool, in the transaction that moves the pin or
// removes the tool
interface ToolChanged {
  // kind mcp.tool_changed
  tool: string;
  fromHash: string;
  toHash: string | null; // null when the server dropped the tool
  cause: 'trusted' | 'allowed' | 'removed';
}

// policy module: the operation of a proxied tool's action proposal holds the pin
const operation = {
  kind: 'action',
  tool: 'tracker.item_create',
  input,
  destinations,
  pin: 'sha256:3b9f…',
};
// policy.action_rehashed { proposalID, actionHash, pin }: one per open proposal of the tool, in the
// pin move's transaction
```

- The proxy writes `mcp.tool_changed` to each task that is ready, running, waiting, paused or
  stopped and whose tool list holds the tool. The record never wakes a task. The next step renders
  it as a system message of nixie's own text: the tool, the first 12 digits of each hash, and that
  the tool list holds the new form, or that the tool is gone.
- A [worker](../../glossary.md) has no inbox, so it keeps its starting form, and the proxy checks
  its calls against the current pin.
- The action handler recomputes the hash at each answer, so an answer from a card that showed the
  old form fails as `CONFLICT`. A deferred proposal that the pin move rehashes returns to pending.

## Constraints

### Server listings and calls

- The proxy runs a server listing when the server is added or its widening is approved, when the
  server reports a changed list, when a task run's endpoint starts with one of its tools, and on the
  backoff while its latest listing failed.
- The proxy never lists a `held` or `removed` server. A held server's tools stay on each tool list
  in their pinned form, and a call returns an error that says the server waits for your approval.
- A call reaches the server only when the latest server listing passed and left the tool `exposed`.
- The input check and the result check read the current pin, never the task run's starting form.
- Neither the secret nor the access token reaches the model, a sandbox, a record or a log line.

### Records and tables

- Every `mcp.*` record sits off any task thread, except `mcp.tool_changed`.
- The proxy writes `mcp.tool_listed { serverID, tool, hash }`, with the tool form in its
  [erasable fields](../../architecture/core/erasable-fields.md), once for each tool and hash pair
  that `mcp_tools` has not held, and `mcp.pin_moved { tool, fromHash, toHash, cause }` for each
  move. A server listing that changes nothing writes nothing.
- A pin move, its `mcp.tool_changed` records and its `policy.action_rehashed` records commit in one
  transaction.
- `mcp_servers`, `mcp_tools` and `mcp_tool_forms` arrive in one appended migration that only adds
  tables.

### Tests

- The mcp module's test utilities export a stand-in Streamable HTTP server on loopback, behind a
  stand-in token endpoint, with a read tool, a write tool that names a destination, and a tool that
  answers `isError`.
- A test changes a tool form, fails the next server listing, drops a tool between 2 listings, or
  expires the access token.
- Only a test build loads a config that pairs a host with a loopback range. The composition root
  never builds the stand-in server.

## Decisions

- **A proxied tool's name is `<serverID>.<tool>`.** Rules and task definitions name the tool the
  same way they name nixie's own.
- **A service client is the only auth kind in this build.** Both first servers take one and refuse a
  static token, and the scopes the server grants cap what nixie can do there.
- **The access token stays inside the credential store.** The proxy never reads it, so no code
  outside the store can log it or pass it to a sandbox.
- **Adding a server is only a config change, approved once at start.** A host command that took a
  URL would add a server the deployment never configured.
- **A stopped or held tool stays on the tool list in its pinned form.** A tool that vanishes reads
  to the model as a missing capability, and an unchanged tool list keeps the prompt cache.
- **A proxied result always reaches the model inside untrusted markers, direct calls included.** Its
  text comes from outside nixie, and the random marker ID stops that text from closing the markers.

## Builder decides

- Internal names, the projections' indexes and the order of their folds.
- How the endpoint awaits `prepareTaskRun` within its start.
- The wording of each error, notice and change note, and the layout of `nixie mcp` output.
- How the store schedules a token exchange that several requests wait on at once.

## Out of scope

- atc. [The coding session runner](https://linear.app/zgeoff/issue/GEO-1843) calls atc-gateway
  directly, and the proxy carries none of atc's tools.
- A server run over stdio in a sandbox: [GEO-2656](https://linear.app/zgeoff/issue/GEO-2656).
- An OAuth grant that you sign in for: [GEO-2657](https://linear.app/zgeoff/issue/GEO-2657).
- A static bearer token, or a server with no auth. Each waits for a server that needs it.
- Input requests from a server. Neither first server sends one, and
  [the input-request spike](https://linear.app/zgeoff/issue/GEO-269) measures the window first.
- Sampling, roots and logging from a server, and a server reached through a sandbox's own egress.

## Open questions

- **May nixie file and change work items?** The owner settles it in
  [GEO-2832](https://linear.app/zgeoff/issue/GEO-2832). The recommendation is the `write` scope,
  with every write tool declared `write` and asking until you add an allow rule. Until then the
  service client asks for `read`, and no write tool has a declaration.
- **Which listener of the work tracker does the proxy call?** The owner settles it in
  [GEO-2833](https://linear.app/zgeoff/issue/GEO-2833). The recommendation is the public door, as a
  service client, because the private listener runs every call as you with no token. Until then the
  config accepts only `service_client` auth.
- **Is either server trusted?** The owner settles it in
  [GEO-2834](https://linear.app/zgeoff/issue/GEO-2834). The recommendation is the metrics server
  only. Until then both run with `trusted: false`.
- **Where do declarations live?** The owner settles it in
  [GEO-2835](https://linear.app/zgeoff/issue/GEO-2835). The recommendation is one file per server in
  the definitions repo. Until then `nixie mcp declare` is the only way.
