# The MCP proxy build

- **Status:** draft
- **Work items:** [the proxy](https://linear.app/zgeoff/issue/GEO-1842). It needs
  [the credential store](https://linear.app/zgeoff/issue/GEO-1824),
  [untrusted markers on a direct tool's result](https://linear.app/zgeoff/issue/GEO-2836) and
  [the OAuth return spike](https://linear.app/zgeoff/issue/GEO-267). Two items build on it:
  [a changed tool in a running task](https://linear.app/zgeoff/issue/GEO-1254) and
  [the pin in the action hash](https://linear.app/zgeoff/issue/GEO-1255).
- **Decision records:** [0009](../../decisions/0009-mcp-proxy.md)

The assistant uses the tools of an outside MCP server through nixie's proxy. You add a server in the
deployment config, then press Connect on its page and sign in, the way any MCP client signs in to a
server. Each tool takes the name `<serverID>.<tool>` and is pinned: the proxy exposes it only in the
form you allowed. Each call passes the decision point like any of nixie's tools, under an effect
declaration that comes from the tool's own MCP annotations unless a file in the definitions repo
overrides it. Its result reaches the model inside untrusted markers, and the server's tokens never
leave the credential store. The first build serves 2 HTTP servers of your own: a work tracker and a
delivery-metrics server. [The MCP proxy design](../platform/connectors/mcp-proxy.md) holds the rules
for pins and failed listings, and this design holds the contracts the build follows.

## Shape

```mermaid
flowchart LR
  config["mcp.servers in config.yaml"] -->|"new or widened"| you[your approval]
  you --> connect[Connect: OAuth sign-in]
  connect --> lister[server listing]
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

Both servers serve Streamable HTTP at `/mcp`, and sign clients in with the MCP standard's
authorization: OAuth 2.1 with the authorization code grant and PKCE, a 15-minute access token, and a
30-day refresh token that rotates at each use. You sign in on the server's own page with a passkey.
Neither server offers dynamic client registration, so you register nixie as a client on each server
once, with nixie's return URL. The deployment's private config holds their hosts and client IDs.
This doc calls them `tracker` and `metrics`. The tracker grants `read` and `write`, and the metrics
server grants `read` alone.

## Contracts

### The config

```yaml
# config.yaml: the mcp section, which the mcp module's schema owns
mcp:
  listingTimeoutSeconds: 10 # the default
  servers:
    tracker: # the server ID, which prefixes every tool name
      url: https://tracker.example.org/mcp # https, with no user name, query or fragment
      clientID: nixie-7f3a # the ID the server gave when you registered nixie
      scope: read write # the scopes asked for, space-separated
      trusted: false # the default
      privateRange: null # a CIDR range when the host resolves to a non-public address
```

- A server ID matches `^[a-z][a-z0-9]{1,15}$`, and the load refuses the IDs in [Names](#names).
- `privateRange` is one CIDR range. The load refuses a range that holds a loopback, link-local or
  unspecified address, except in a test build (`NIXIE_TEST_BUILD`).
- The scope, the trust and the URL are per-server choices you make when you add a server. A server
  with more than one listener is a choice of `url`.
- Adding a server is a config change alone. The host commands that added, trusted or removed a
  server go.

### Signing in

The credential store is the one in the
[credentials design](https://github.com/zgeoff/nixie/pull/1414). An MCP server's connection is an
OAuth grant in its database backend, bound to the server's resource URI, as that design sets.

```ts
// libs/contract, under `mcp`: starts the sign-in for one server, from its page in the client.
await client.mcp.connect({ server: 'tracker' });
// → { authorizeURL: 'https://tracker.example.org/oauth2/authorize?…' }
//   the page opens it; the server's sign-in returns to nixie's OAuth return route
```

1. The proxy finds the authorization server as the MCP standard sets: an unauthenticated request to
   `url` answers 401 with a `WWW-Authenticate` header whose `resource_metadata` names the protected
   resource metadata, which names the authorization server, whose metadata gives its endpoints.
2. `mcp.connect` builds the authorization request with `clientID`, `scope`, a PKCE challenge with
   `S256`, a random `state`, and `resource` set to `url`.
3. You sign in on the server's page. The server sends your browser to nixie's
   [OAuth return route](google-connections.md), the one the Google connection uses, at the
   deployment's https host.
4. The return route checks `state` and the `iss` parameter against the authorization server's
   issuer, then exchanges the code with the PKCE verifier and `resource`. The store saves the grant.
5. The proxy lists the server's tools.

- nixie is a public client: it holds no client secret, and every token request carries `resource`.
- The store refreshes the access token before it expires, with the rotating refresh token, as the
  credentials design sets for every OAuth grant. The fetcher sends the access token as
  `Authorization: Bearer` on each request to `url`.
- When the server answers 401, the store refreshes once and resends the request once. A second 401
  fails the request as `unauthorised`. The server sends a 401 from its bearer check, before it runs
  a tool, so the resend never repeats a write.
- When the refresh is refused for good, the store marks the grant `needs_consent`, and the server
  shows "needs sign-in" with a sign-in button on its page.
- The fetcher removes every token from every response and error.

```ts
// credentials module
const fetch = store.fetcher(binding, ['https://tracker.example.org'], {
  redirects: 'none',
  pairing: undefined, // or { host, range } from privateRange
  stream: true, // a server may answer as an SSE stream, which the fetcher scrubs chunk by chunk
});
```

- This item adds the fetcher's `pairing` and `stream`, as their first caller. The proxy holds no
  long-lived stream open.

### Server facts and approvals

The config holds the facts the deployment asks for, and records hold the facts in use. At each
start, the proxy compares each config entry with the server's facts in use:

| The entry against the facts in use                                          | What the start does                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| the same                                                                    | nothing                                                          |
| new; or a new URL or client ID, more scopes, a wider range, or `trusted` on | holds the server, and proposes the facts                         |
| fewer scopes, a narrower range, or `trusted` off                            | applies them with an `mcp.server_changed` record                 |
| gone from the config                                                        | sets the server `removed`, forgets its grant, and keeps its pins |

```ts
// mcp module: the facts in use, folded from records into the mcp_servers projection
interface ServerFacts {
  url: string;
  clientID: string;
  scope: string;
  trusted: boolean;
  privateRange: string | null;
}

// held: waits for its widened facts' proposal; added: approved, and signed in or not
type ServerState = 'held' | 'added' | 'removed';

// mcp module: the operation of an mcp proposal, whose SHA-256 is the proposal's action hash
type McpOperation =
  | { change: 'server'; serverID: string; facts: ServerFacts }
  | { change: 'allow'; tool: string; fromHash: string | null; hash: string }; // null: a new tool
```

- Each widening is one proposal of the new family `mcp`, of kind `internal_change`, on the proposals
  core of [the proposals design](https://github.com/zgeoff/nixie/pull/1411). Its "same thing" key is
  the server ID for `server` and the tool name for `allow`, so a newer proposal for the same server
  or tool replaces the open one.
- A second appended migration rebuilds the `proposals` table, to add `mcp` to its family check.
- The `mcp` handler sets the risk class by operation: `always_ask` for `server`, so you approve it
  with the passkey, and `routine` for `allow`. The causes are `mcp_config` and `mcp_allow`.
- An approved `server` proposal moves the server to `added`, and its page shows Connect. A new URL
  or client ID forgets the old grant, so you sign in again.
- A declined or lapsed `server` proposal leaves the server `held`. A later start proposes again only
  when the config entry differs from the declined facts.
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
  | 'stopped_changed' // the form changed, and waits for an allow
  | 'stopped_unfit' // the override names an argument the latest input schema lacks
  | 'hidden_new' // no allowed form yet, a form the registry refuses, or a pinned form a forget erased
  | 'removed'; // the latest server listing lacks the tool
```

```text
mcp_tools, a projection, one row per tool a server listing has held
  tool          text primary key  -- '<serverID>.<tool>', such as 'tracker.item_get'
  server_id     text not null
  pinned_hash   text              -- null until an allow pins the tool
  latest_hash   text not null     -- the hash in the newest passed server listing
  state         text not null     -- a PinState

mcp_tool_forms, a projection, one row per tool form a server listing has held
  hash          text primary key
  listed_seq    integer not null  -- the mcp.tool_listed record whose erasable fields hold the form
```

- A new tool on a server that is not trusted stays `hidden_new`, and its listing writes an `allow`
  proposal whose card shows the form and the declaration it would run under. A new tool on a trusted
  server pins at once.
- An approved `allow` moves the pin to the hash its operation holds, never to a later one.
- A trusted server's change moves the pin to the new hash, description changes included, unless the
  new input schema adds a property at any depth. That change stops the tool as `stopped_changed` on
  every server, because a new argument may carry a destination or free text that the declaration
  leaves out.
- A server listing that leaves a tool `stopped_changed` writes its `allow` proposal in the same
  transaction. `nixie mcp allow <tool>` writes one again after you decline or it lapses.
- After a pin move, the fit check runs on the new form against the tool's override, if any. A tool
  both changed and unfit shows `stopped_changed` until the change is allowed, then `stopped_unfit`
  until the override changes.
- A stopped tool, and every tool of a `held` server or a server that needs sign-in, stays on each
  tool list in its pinned form. A hidden tool, a removed tool and every tool of a `removed` server
  are on no tool list.
- Each pin move calls `onPinMoved(tx, move)` inside its transaction. The 2 items that build on this
  one add their writes there, and this item ships it with no listener.
- When a forget has made a pinned form unreadable, the next server listing that holds the hash
  writes `mcp.tool_listed` again. When no listing holds it, the proxy has no form to show, so it
  sets the tool `hidden_new` and proposes its latest form.

### Names

- A proxied tool's name is `<serverID>.<tool>`, such as `tracker.item_get`. Rules, task definitions,
  override files and `nixie mcp` name it so.
- In a rule, `tracker.*` matches every tool of the server. In a task definition's tool list,
  `tracker.*` stands for every tool of the server on the tool lists when the task run starts, its
  stopped tools included.
- The definitions parser keeps any name whose first segment is a configured server ID, so a task can
  name a tool before you allow it. The endpoint holds the name once the tool is on the tool lists.
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

Each tool's declaration comes from its pinned form's MCP annotations. An override in the definitions
repo replaces it.

| Annotation in the pinned form                                      | Effects                 |
| ------------------------------------------------------------------ | ----------------------- |
| `readOnlyHint: true`                                               | `[read]`                |
| `readOnlyHint` false or missing, `destructiveHint: false`          | `[write, send]`         |
| `readOnlyHint` false or missing, `destructiveHint` true or missing | `[write, delete, send]` |

- A missing annotation takes the MCP standard's default: not read-only, destructive and open world.
  A tool with no annotations therefore declares `[write, delete, send]`, and every call to it asks
  until an allow rule or an override covers it.
- With no override, a declaration lists no destination and no amount, lists every string argument at
  any depth as `content`, and has no `reconcile`.

```yaml
# definitions repo: mcp/tracker.yaml, one file per server, keyed by the tool's server name
item_create:
  effects: [write]
  destinations: [] # argument names that hold a destination
  amount: null # the argument that holds the amount of a spend
  content: [title, body] # free-text arguments
  reconcile: null # or { idempotencyKey: <argument> } or { check: <read tool> }; null brings an
  # interrupted queued call to you
item_notify:
  effects: [send]
  destinations: [assignee_email]
  content: [message]
```

```ts
// mcp module: the declaration in force for one call
interface ToolDeclaration {
  tool: string;
  declaration: Omit<EffectDeclaration, 'results'>; // EffectDeclaration: policy module
  reconcile: { idempotencyKey: string } | { check: string } | null; // maps onto connectors' Reconcile
  from: 'annotations' | 'override';
  pinnedHash: string;
  definitionsHash: string | null; // the definitions snapshot that held the override
}
```

- An override file changes through the definitions repo, as every definition does, so its review is
  the repo's own. A file that names a tool the server lacks, or an argument its pinned input schema
  lacks, leaves that tool `stopped_unfit`. A file that fails to parse refuses the whole seed.
- The declaration's `results` maps every output field to `untrusted`, and nobody declares it.
- Each proxied call's records hold the pinned hash, which is the tool's version, and the definitions
  snapshot in force, so a replay reads the decision under the form and declaration it ran under. The
  decision point reads a proxied declaration from the registry.
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
  // Lists the server of each named tool, unless that server's backoff is running, before the task
  // run's first step reads its tool list. It never rejects: a failed listing leaves the pinned tools in place.
  prepareTaskRun(tools: readonly string[]): Promise<void>;
}

declare function buildToolRegistry(
  definitions: readonly ToolDefinition[], // …existing
  sources: readonly ToolSource[], // nixie's own tool wins a name clash
): ToolRegistry; // toolNames merges each source's names at each read
```

```ts
// mcp module: the definition of an exposed or stopped tool, built from its pinned form
const definition: ToolDefinition = {
  name: 'tracker.item_get',
  description: pinned.description ?? '',
  input: pinned.inputSchema,
  output: pinned.outputSchema ?? { type: 'object', properties: { text: { type: 'string' } } },
  declaration, // from the override or the annotations, with every result untrusted
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

### The model's view of servers

```ts
mcp.servers({});
// → [{ server: 'tracker', state: 'added', signIn: 'ok', health: 'healthy',
//      tools: { exposed: 12, stopped: 1, hidden: 2 } },
//    { server: 'metrics', state: 'added', signIn: 'needs_sign_in', health: 'healthy',
//      tools: { exposed: 6, stopped: 0, hidden: 0 } }]
// mcp module. Effects: read. Lists every server that is not removed.
```

- A call to a tool that can't run returns plain text that names the reason, such as
  "tracker.item_get changed and waits for your review", "tracker needs you to sign in again",
  "tracker waits for your approval" or "tracker is unreachable, next try 14:05".

### Calls and the untrusted markers

```ts
// libs/wire, built: the one helper for outside text
declare function renderFenced(input: {
  tag: string;
  attributes: Record<string, string>;
  text: string;
  fence: string; // from mintBlockID()
}): string;

// tools module: the endpoint's answer to every proxied call
const answer: CallToolResult = {
  content: [
    {
      type: 'text',
      text: renderFenced({
        tag: 'tool-result',
        attributes: { source: 'untrusted' },
        text: body,
        fence: mintBlockID(),
      }),
    },
    ...images, // image blocks, after the text
  ],
  isError: false, // true for a server's isError result, whose text takes the same markers
};
// body: the text of a { text } result as it stands, or the JSON of any other result
// → '<tool-result source="untrusted" fence="3f9a0c21b7de">\n…\n</tool-result fence="3f9a0c21b7de">'
```

- The endpoint never sends `structuredContent` for a proxied tool, because the model would read it
  without the markers.
- nixie's own errors for a proxied call are plain text with no markers, as every other tool's errors
  are.
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
  `unparsable`, `timeout` or `unauthorised`.
- Failed listings back off with `libs/retry`, from 1 min to 1 h. After 3 in a row the server is
  unhealthy. The proxy writes `mcp.health_changed { serverID, isUnhealthy, lastError, nextTryAt }`
  when the server becomes unhealthy and when it recovers.
- A start resets every health state, and writes a recovery record for each server whose last
  `mcp.health_changed` said unhealthy.
- When the latest listing failed and the next try is due, a call makes that try itself before it
  calls the tool.
- When the latest listing failed and the next try is not due, or the call's own try fails, the call
  returns the unreachable error. The composition root passes the mcp module the time tool's
  formatter for the time.
- A grant marked `needs_consent` is not a health failure: the proxy stops listing the server until
  you sign in, and `mcp.servers` shows `needs_sign_in`.

### The servers page

- The web client gains a page that lists each server with its state, its sign-in status, its health
  and its tools, and shows Connect for a server with no grant and Sign in again for one whose grant
  needs consent.
- The `mcp` proposal cards show through the existing approval cards.

## Constraints

### Server listings and calls

- The proxy runs a server listing when the server signs in, when a task run's endpoint starts with
  one of its tools, when a call finds the next try due, and on the backoff. A task run that starts
  during the backoff skips the listing.
- At most one listing of a server runs at a time, and every caller that wants one awaits it.
- The proxy never lists a `held` or `removed` server, or a server with no live grant.
- A call reaches the server only when the latest server listing passed and left the tool `exposed`.
- The input check and the result check read the current pin, never the task run's starting form.
- No token reaches the model, a sandbox, a record or a log line.
- The proxy never answers an input request and never lists again on a list-change notice. It sees a
  changed list at its next listing.

### Records and tables

- Every `mcp.*` record sits off any task thread.
- The proxy writes `mcp.tool_listed { serverID, tool, hash }`, with the tool form in its
  [erasable fields](../../architecture/core/erasable-fields.md), once for each tool and hash pair
  that `mcp_tools` has not held, and `mcp.pin_moved { tool, fromHash, toHash, cause }` for each
  move. A server listing that changes nothing writes nothing.
- `mcp_servers`, `mcp_tools` and `mcp_tool_forms` arrive in one appended migration that only adds
  tables. The `proposals` rebuild is a migration of its own.

### Tests

- The mcp module's test utilities export a stand-in Streamable HTTP server and a stand-in
  authorization server on loopback, with protected resource metadata, PKCE, rotating refresh tokens,
  a read tool, a write tool that names a destination, a tool with no annotations, and a tool that
  answers `isError`. Only a test build loads a config that pairs a host with a loopback range, and
  only there does the config accept `http` for that host.
- A test signs in, changes a tool form, fails the next server listing, drops a tool between 2
  listings, expires the access token, and refuses the refresh.

## Decisions

- **A proxied tool's name is `<serverID>.<tool>`.** Rules and task definitions name the tool the
  same way they name nixie's own.
- **A server signs nixie in with the MCP standard's OAuth.** Every MCP client signs in to these
  servers the same way, and the scopes you grant at sign-in cap what nixie can do there.
- **The tokens stay inside the credential store.** The proxy never reads them, so no code outside
  the store can log them or pass them to a sandbox.
- **Adding a server is only a config change, approved once at start.** A host command that took a
  URL would add a server the deployment never configured.
- **A declaration comes from the tool's annotations unless the definitions repo overrides it.** The
  MCP standard's defaults for a missing annotation make an unknown tool ask, and an override is the
  only way to name a destination or an amount.
- **A stopped or held tool stays on the tool list in its pinned form.** A tool that vanishes reads
  to the model as a missing capability, and an unchanged tool list keeps the prompt cache.
- **A proxied result always reaches the model inside untrusted markers, direct calls included.** Its
  text comes from outside nixie, and the random marker ID stops that text from closing the markers.

## Builder decides

- Internal names, the projections' indexes and the order of their folds.
- The `nixie mcp` commands beyond `allow` and `tools`, such as `diff`, the module that holds them,
  and the layout of their output beyond the fields this design names.
- The defaults that the connectors module's `Reconcile` needs beyond the override file's fields.
- The wording of each error, notice and change note.
- The servers page's layout.

## Out of scope

- atc. [The coding session runner](https://linear.app/zgeoff/issue/GEO-1843) calls atc-gateway
  directly, and the proxy carries none of atc's tools.
- [A server run over stdio in a sandbox](https://linear.app/zgeoff/issue/GEO-2656).
- Dynamic client registration, a static bearer token, a client secret, or a server with no auth.
  Each waits for a server that needs it.
- Input requests from a server.
- Sampling, roots and logging from a server, and a server reached through a sandbox's own egress.
