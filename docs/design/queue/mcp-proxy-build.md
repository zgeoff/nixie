# The MCP proxy build

- **Status:** draft
- **Work items:** [the proxy](https://linear.app/zgeoff/issue/GEO-1842). It needs
  [the credential store](https://linear.app/zgeoff/issue/GEO-1824) and
  [one marker for outside text](https://linear.app/zgeoff/issue/GEO-2836). Two items build on it:
  [a changed tool in a running task](https://linear.app/zgeoff/issue/GEO-1254) and
  [the pin in the action hash](https://linear.app/zgeoff/issue/GEO-1255).
- **Decision records:** [0009](../../decisions/0009-mcp-proxy.md)

The assistant uses the tools of an outside MCP server through nixie's proxy. Each tool takes the
name `<serverID>.<tool>` and is pinned: the proxy exposes it only in the form you allowed, under an
effect declaration you approved. Each call passes the decision point like any of nixie's tools, its
result reaches the model inside untrusted markers, and the server's credential never leaves the
credential store. The first build serves 2 HTTP servers of your own: a work tracker and a
delivery-metrics server. [The MCP proxy design](../platform/connectors/mcp-proxy.md) sets the rules
for pins, failed listings and declarations, and this design adds the contracts the build follows.
Once the owner sets Status to agreed, and the credential store and marker items have landed, the
proxy item is built from it. The [open questions](#open-questions) change only config values and
declarations, so the build ships with the default each one gives, and needs no answer first.

## Shape

```mermaid
flowchart LR
  config["mcp.servers in config.yaml"] -->|"new or widened"| you[your approval]
  you --> lister[server listing]
  lister -->|"a new or changed tool"| you
  lister -->|"hash each tool form"| pins[(pins)]
  pins -->|"pinned forms"| registry[tool registry]
  registry --> endpoint[task run's tool endpoint]
  endpoint -->|"decision point"| call[proxy call]
  call -->|"credential store fetcher"| server[MCP server]
  server -->|"result, marked untrusted"| endpoint
```

## Terms

- A **server listing** is one MCP `tools/list` of one server.
- A **tool form** is one tool as a server listing returns it, in canonical JSON.
- A tool's **pin** is the hash of the tool form you allowed: one you reviewed, or a trusted server's
  later change, which you allowed when you trusted the server.

## The first two servers

Both servers serve Streamable HTTP at `/mcp` behind an OAuth server that takes service clients. A
service client sends its ID, `service:<name>`, and its secret to the token endpoint with the
`client_credentials` grant, and gets a short-lived access token with no refresh token. Both servers
refuse a static bearer token. The deployment's private config holds their hosts. This doc calls them
`tracker` and `metrics`. The metrics server has only read tools. The tracker's service client holds
`read`, and `write` waits on [an open question](#open-questions), so the first build tests its write
path against the stand-in server alone.

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

- A server ID matches `^[a-z][a-z0-9]{1,15}$`, and the load refuses the IDs in [Names](#names).
- `privateRange` is one CIDR range. The load refuses a range that holds a loopback, link-local or
  unspecified address, except in a test build (`NIXIE_TEST_BUILD`).

### The service client credential

The credential store is the one in the
[credentials design rewrite](https://github.com/zgeoff/nixie/pull/1414), whose interface this sketch
follows. This design adds the `service_client` kind.

```ts
// credentials module. The file backend holds the secret; the store holds the access token.
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
  pairing: undefined, // or { host, range } from privateRange
});
```

- [The credential store item](https://linear.app/zgeoff/issue/GEO-1824) builds the store, its file
  backend and its fetcher. This item adds the `service_client` kind, and the fetcher's `pairing` and
  `stream`, as their first caller.
- The proxy passes `stream: true`, so a server may answer a request as an SSE stream, which the
  fetcher scrubs chunk by chunk. The proxy holds no long-lived stream open.
- The store exchanges the secret for an access token at the first request, with
  `client_secret_basic`, and holds the token in process memory only. A restart forgets it.
- The fetcher sends the token as `Authorization: Bearer` on every request except the one to
  `tokenURL`. Once the token's `expires_in` has passed, the store exchanges again first.
- When the server answers 401, the store exchanges once more and resends the request once. A second
  401 fails the request as `unauthorised`. The server sends a 401 from its bearer check, before it
  runs a tool, so the resend never repeats a write.
- A token endpoint that answers 400 or 401 fails the request as `unauthorised`, and any other
  failure as `error`.
- The fetcher removes both the secret and the token from every response and error.

### Server facts and approvals

The config holds the facts the deployment asks for, and records hold the facts in use. At each
start, the proxy compares each config entry with the server's facts in use:

| The entry against the facts in use                                                                       | What the start does                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| the same                                                                                                 | nothing                                          |
| new; or a new URL, token URL, client ID or secret reference, more scopes, a wider range, or `trusted` on | holds the server, and proposes the facts         |
| fewer scopes, a narrower range, or `trusted` off                                                         | applies them with an `mcp.server_changed` record |
| gone from the config                                                                                     | sets the server `removed`, and keeps its pins    |

```ts
// mcp module: the facts in use, folded from records into the mcp_servers projection
interface ServerFacts {
  url: string;
  auth: {
    kind: 'service_client';
    tokenURL: string;
    clientID: string;
    scope: string;
    secret: string;
  }; // secret: the deployment: reference, never the value
  trusted: boolean;
  privateRange: string | null;
}

type ServerState = 'held' | 'added' | 'removed'; // held: waits for its widened facts' proposal

// mcp module: the operation of an mcp proposal, whose SHA-256 is the proposal's action hash
type McpOperation =
  | { change: 'server'; serverID: string; facts: ServerFacts }
  | {
      change: 'declare';
      tool: string;
      hash: string;
      declaration: ToolDeclared['declaration'];
      reconcile: ToolDeclared['reconcile'];
    }
  | { change: 'allow'; tool: string; fromHash: string; hash: string }; // allow a changed tool
```

- Each widening is one proposal of the new family `mcp`, of kind `internal_change`, on the proposals
  core of [the proposals design](https://github.com/zgeoff/nixie/pull/1411). Its "same thing" key is
  the server ID for `server` and the tool name for `declare` and `allow`, so a newer proposal for
  the same server or tool replaces the open one.
- A second appended migration rebuilds the `proposals` table, to add `mcp` to its family check.
- The `mcp` handler sets the risk class by operation: `always_ask` for `server`, so you approve it
  with the passkey, and `routine` for `declare` and `allow`. The causes are `mcp_config`,
  `mcp_declare` and `mcp_allow`.
- The start writes a `server` proposal. `nixie mcp declare` writes a `declare` proposal, and a
  tool's first declaration is always one.
- The server listing that leaves a tool `stopped_changed` writes its `allow` proposal, in the same
  transaction. `nixie mcp allow <tool>` writes one again after you decline or it lapses.
- A declined or lapsed `server` proposal leaves the server `held`. A later start proposes again only
  when the config entry differs from the declined facts.
- An approved `server` proposal registers the new binding while nixie runs. When the secrets file
  lacks the new reference, the server stays `held`, and `nixie mcp list` shows why.
- The `mcp` handler recomputes the operation from the current facts and the tool's latest hash at
  each answer, so an answer from a card that showed older facts or an older form fails as
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
  | 'stopped_changed' // the form changed, and waits for an allow or a new declaration
  | 'stopped_unfit' // the declaration names an argument the latest input schema lacks
  | 'hidden_new' // no declaration yet, a form the registry refuses, or a pinned form a forget erased
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
  one. A `declare` pins the latest form, so it also clears `stopped_changed` and `stopped_unfit`.
- A trusted server's change moves the pin to the new hash, description changes included, unless the
  new input schema adds a property at any depth. That change stops the tool as `stopped_changed`,
  because a new argument may carry a destination or free text that the declaration leaves out.
- After a pin move, the fit check runs on the new form. A tool both changed and unfit shows
  `stopped_changed` until the change is allowed, then `stopped_unfit` until a new declaration.
- A stopped tool, and every tool of a `held` server, stays on each tool list in its pinned form. A
  call to it returns an error such as "tracker.item_get changed and waits for your review". A hidden
  tool, a removed tool and every tool of a `removed` server are on no tool list.
- Each pin move calls `onPinMoved(tx, move)` inside its transaction. The 2 items that build on this
  one add their writes there, and this item ships it with no listener.
- When a forget has made a pinned form unreadable, the next server listing that holds the hash
  writes `mcp.tool_listed` again. When no listing holds it, the proxy has no form to show, so it
  sets the tool `hidden_new` until you declare its latest form.

### Names

- A proxied tool's name is `<serverID>.<tool>`, such as `tracker.item_get`. Rules, task definitions
  and `nixie mcp` name it so.
- In a rule, `tracker.*` matches every tool of the server. In a task definition's tool list,
  `tracker.*` stands for every tool of the server on the tool lists when the task run starts, its
  stopped tools included.
- The definitions parser keeps any name whose first segment is a configured server ID, so a task can
  name a tool before you declare it. The endpoint holds the name once the tool is on the tool lists.
- The model reads `mcp__nixie__tracker_item_get`, from the existing `toSDKToolName`, where `nixie`
  is the name of the one MCP server the model reaches, nixie's tool endpoint.
- The config load refuses a server ID when a tool nixie registers starts with `<id>.` or `<id>_`,
  such as `web` for `web_fetch`. A release that adds such a tool refuses to start, with an error
  that names the server.
- The proxy keeps a tool `hidden_new`, with the reason in `nixie mcp tools`, when the server's name
  falls outside `^[A-Za-z0-9_-]{1,64}$`, when its model name passes 64 characters, or when another
  tool already holds its model name.
- A server that renames a tool lists a new tool, so a rule that named the old one matches nothing
  until you edit it.

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
  reconcile: { idempotencyKey: string } | { check: string } | null; // maps onto connectors' Reconcile
  pinnedHash: string; // the tool form this declaration was approved against
  proposalID: string | null; // null for a narrowing, which applies with no proposal
}
```

- `nixie mcp declare --prefill <tool>` prints a file from the latest form's annotations:
  `readOnlyHint: true` gives `[read]`, and `destructiveHint: false` drops `delete`. With no
  annotations it gives `[write, delete, send]`. Only the declaration you approve counts.
- A declaration narrows when every call meets the same checks or stricter ones, and narrowing
  applies at once. Adding an effect, a destination, the amount or a content argument narrows,
  because each addition lets more of your ask and deny rules match the call. Removing `reconcile`
  narrows, because an interrupted call then comes to you. Every other change is a `declare`
  proposal.
- The declaration's `results` maps every output field to `untrusted`, and nobody declares it.
- Each proxied call's records hold the pin and the `mcp.tool_declared` sequence in force, so a
  replay reads the decision under the form and declaration it ran under. The
  [snapshot](../platform/policy/rules.md#the-snapshot-hash) holds no proxied tool, so the decision
  point reads a proxied declaration from the registry.
- A queued proxied tool reaches the action runners through a `findConnector(tool)` lookup, which
  replaces their fixed map, and the mcp module answers it for proxied tools. With `idempotencyKey`,
  the proxy fills that argument with the action ID. With `check`, it calls the named read tool with
  the call's input, and counts a result as done and an empty one as not done.

### The registry

```ts
// tools module: a second source of tool definitions, which the composition root passes in. The mcp
// module provides it.
interface ToolSource {
  toolNames(): readonly string[]; // the exposed, stopped and held tools, read at each call
  // Built from the current pin, and cached per hash. Every proxied definition passes the registry's
  // existing checks at each pin move; one that fails stays hidden_new.
  findTool(name: string): RegisteredTool | null;
  // Lists each server the names reach, unless its backoff is running, before the task run's first
  // step reads its tool list. It never rejects: a failed listing leaves the pinned tools in place.
  prepareTaskRun(tools: readonly string[]): Promise<void>;
}

declare function buildToolRegistry(
  definitions: readonly ToolDefinition[], // …existing
  sources: readonly ToolSource[], // nixie's own tools win a name
): ToolRegistry; // toolNames merges each source's names at each read
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

- The conversation holds every proxied tool on the tool lists, as it holds every tool the registry
  names, and reads the names again at each turn's start. A task holds the proxied tools its
  definition names.
- The endpoint's start awaits `prepareTaskRun` before it reads the names, bounded by the listing
  timeout. A turn reads the tool list once, at its start. Each call reads the current pin.
- A tool whose pinned form has no output schema returns `{ text }`: the result's text blocks joined
  by a blank line. Image blocks go back as the result's images, under the turn's image caps. The
  proxy drops every other block kind, and `text` ends with a line that counts them.

### Calls and the untrusted markers

```ts
// libs/wire, from the marker work item: the one helper for outside text
declare function renderFenced(tag: string, source: ContentSource, text: string): string;

// tools module: the endpoint's answer to every proxied call
const answer: CallToolResult = {
  content: [
    { type: 'text', text: renderFenced('tool-result', 'untrusted', body) },
    ...images, // image blocks, after the text
  ],
  isError: false, // true for a server's isError result, whose text takes the same markers
};
// body: the text of a { text } result as it stands, or the JSON of any other result
// → '<tool-result source="untrusted" fence="3f9a0c21b7de">\n…\n</tool-result fence="3f9a0c21b7de">'
```

- The endpoint never sends `structuredContent` for a proxied tool, because the model would read it
  without the markers.
- nixie's own errors for a proxied call, such as a stopped tool, a held server or an unreachable
  one, are plain text with no markers, as every other tool's errors are.
- A queued proxied call's result reaches the task through the inbox, which wraps it in the same
  markers as every action result.
- The MCP client runs in `auto` protocol mode, with no sampling, roots, logging or input-request
  capability. The proxy checks each result against the pinned output schema, so the client's own
  check, which reads the latest listing, must accept every result.
- The proxy sends each request to the configured URL alone, through the fetcher, with no redirect,
  `Origin` header or cookie.

### Health

- The proxy keeps one health state per server, in memory, shared by every task run: the failed
  server listings in a row, the next try, and the last error, one of `refused`, `error`,
  `unparsable`, `timeout` or `unauthorised`. A listing the store fails as `unauthorised` counts like
  any other failure, and this build has no credential status.
- Failed listings back off with `libs/retry`, from 1 min to 1 h. After 3 in a row the server is
  unhealthy. The proxy writes `mcp.health_changed { serverID, isUnhealthy, lastError, nextTryAt }`
  when the server becomes unhealthy and when it recovers, and `nixie mcp list` shows the state.
- A start resets every health state, and writes a recovery record for each server whose last
  `mcp.health_changed` said unhealthy.
- When the latest listing failed and the next try is due, a call makes that try itself before it
  calls the tool.
- When the latest listing failed and the next try is not due, or the call's own try fails, the call
  returns "tracker is unreachable, next try 14:05". The composition root passes the mcp module the
  time tool's formatter for the time.

## Constraints

### Server listings and calls

- The proxy runs a server listing when the server is added or its widening is approved, when a task
  run's endpoint starts with one of its tools, when a call finds the next try due, and on the
  backoff. A task run that starts during the backoff skips the listing.
- At most one listing of a server runs at a time, and every caller that wants one awaits it.
- The proxy never lists a `held` or `removed` server. A held server's tools stay on each tool list
  in their pinned form, and a call returns an error that says the server waits for your approval.
- A call reaches the server only when the latest server listing passed and left the tool `exposed`.
- The input check and the result check read the current pin, never the task run's starting form.
- Neither the secret nor the access token reaches the model, a sandbox, a record or a log line.

### Records and tables

- Every `mcp.*` record sits off any task thread.
- The proxy writes `mcp.tool_listed { serverID, tool, hash }`, with the tool form in its
  [erasable fields](../../architecture/core/erasable-fields.md), once for each tool and hash pair
  that `mcp_tools` has not held, and `mcp.pin_moved { tool, fromHash, toHash, cause }` for each
  move. A server listing that changes nothing writes nothing.
- `mcp_servers`, `mcp_tools` and `mcp_tool_forms` arrive in one appended migration that only adds
  tables. The `proposals` rebuild is a migration of its own.

### Tests

- The mcp module's test utilities export a stand-in Streamable HTTP server and token endpoint on
  loopback, with a read tool, a write tool that names a destination, and a tool that answers
  `isError`. Only a test build loads a config that pairs a host with a loopback range, and only
  there does the config accept `http` for that host.
- A test changes a tool form, fails the next server listing, drops a tool between 2 listings, or
  expires the access token.

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
- The `nixie mcp` commands beyond `declare` and `allow`, such as `diff`, the module that holds them,
  and the layout of their output beyond the fields this design names.
- The defaults that the connectors module's `Reconcile` needs beyond the file's fields.
- The wording of each error, notice and change note.
- How the store shares one token exchange among requests that wait on it.

## Out of scope

- atc. [The coding session runner](https://linear.app/zgeoff/issue/GEO-1843) calls atc-gateway
  directly, and the proxy carries none of atc's tools.
- [A server run over stdio in a sandbox](https://linear.app/zgeoff/issue/GEO-2656), and
  [an OAuth grant that you sign in for](https://linear.app/zgeoff/issue/GEO-2657).
- A static bearer token, or a server with no auth. Each waits for a server that needs it.
- Input requests from a server. Neither first server sends one, and
  [the input-request spike](https://linear.app/zgeoff/issue/GEO-269) measures the window first.
- Sampling, roots and logging from a server, and a server reached through a sandbox's own egress.
- A list-change notice from a server. The proxy sees a changed list at its next listing.
- A server list in the web client. The `mcp` proposal cards show their bodies through the existing
  approval cards.

## Open questions

- **May nixie file and change work items?** The owner settles it in
  [the tracker's write scope](https://linear.app/zgeoff/issue/GEO-2832). The recommendation is the
  `write` scope, with every write tool declared `write` and asking until you add an allow rule.
  Until then the service client asks for `read`, and no write tool has a declaration.
- **Which listener of the work tracker does the proxy call?** The owner settles it in
  [the tracker's listener](https://linear.app/zgeoff/issue/GEO-2833). The recommendation is the
  public listener, as a service client, because the private listener runs every call as you with no
  token. Until then the config accepts only `service_client` auth.
- **Is either server trusted?** The owner settles it in
  [trust for the two servers](https://linear.app/zgeoff/issue/GEO-2834). The recommendation is the
  metrics server only. Until then both run with `trusted: false`.
- **Where do declarations live?** The owner settles it in
  [where declarations live](https://linear.app/zgeoff/issue/GEO-2835). The recommendation is one
  file per server in the definitions repo. Until then `nixie mcp declare` is the only way.
