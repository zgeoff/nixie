# Spike: an MCP proxy that pins tools by hash

This spike builds a minimal version of the proxy that
[0017](../../../../decisions/0017-mcp-proxy.md) puts in front of every outside MCP server, on the v2
TypeScript MCP packages. The proxy pins each tool by a hash of its listing, stops a tool whose hash
changes until the owner approves it, applies the change with a notice for a trusted server, and
exposes a tool only with an owner effect declaration whose destination arguments exist in the
current input schema. Every change the run made to the stand-in server was caught. The v2 client
negotiated 2026-07-28 with a v2 server and fell back to 2025-11-25 with a v1 server, and it rejects
structured content that breaks the output schema by itself.

## Questions

1. Does a hash over each tool's listing catch a changed description, a changed input schema, a new
   tool, a removed tool and a change to annotations alone?
2. Does a trusted server's change, applied with a notice, still stop a tool whose declared
   destination argument no longer exists?
3. Which protocol revision does the v2 client negotiate in `auto` mode, with a v2 server and with a
   v1 server?
4. Does the v2 client validate `structuredContent` against the tool's `outputSchema` by itself, and
   can the proxy validate against its pinned schema instead?

## Versions

| Component                      | Version |
| ------------------------------ | ------- |
| `@modelcontextprotocol/client` | 2.3.1   |
| `@modelcontextprotocol/server` | 2.3.1   |
| `@modelcontextprotocol/sdk`    | 1.32.1  |
| Bun                            | 1.4.2   |

## Setup

[`server.ts`](server.ts) is the stand-in outside server, on stdio, built on the low-level v2
`Server` with raw JSON Schemas so the run controls every byte of each listing. It serves 3 tools:

- `get_forecast`, a read with an `outputSchema` and `structuredContent`
- `send_message`, with a destination argument `to`
- `lookup_note`, with no annotations

The `MUTATION` variable picks one change per start: a description with an injected instruction, the
destination argument renamed to `recipient`, a new tool `delete_all`, `lookup_note` removed,
`send_message` annotated as read-only, or a `structuredContent` whose `highC` is a string.
[`server-v1.ts`](server-v1.ts) is a 2025-era server on the v1 SDK with one tool.

[`proxy.ts`](proxy.ts) is the proxy. It connects as a v2 client with
`versionNegotiation: { mode: 'auto' }`, and:

- hashes each tool with SHA-256 over canonical JSON of its `name`, `title`, `description`,
  `inputSchema`, `outputSchema` and `annotations`, with keys sorted and `_meta` left out
- keeps the pins in a JSON file, and pins a tool only when the owner approves it
- reads the owner effect declarations, each a list of effects and of destination paths into the
  input
- exposes a tool as `<server_id>__<tool>` only when its hash matches its pin, a declaration exists,
  and every declared destination path matches a property in the current input schema
- validates each result against the pinned `outputSchema` with the AJV validator that the client
  package ships, and marks every result as outside content

[`run.ts`](run.ts) pins the baseline, then starts the server once per change under each trust mode,
each from a copy of the baseline pins, and prints the proxy's decision per tool. Under the untrusted
mode it also approves the changed tool and checks again. It ends with calls through the proxy.

## Run it

```bash
cd docs/design/platform/spikes/mcp-proxy-pin
bun install
bun run.ts
```

The run needs no network, no credentials and no model. It writes its pins to a temporary directory
and removes it on exit, and each server process ends with its client.

## Results

```text
== negotiated protocol version: 2026-07-28
== baseline, before the owner reviews the server
  stopped  get_forecast  (new tool: the owner has not reviewed it)
  stopped  send_message  (new tool: the owner has not reviewed it)
  stopped  lookup_note   (new tool: the owner has not reviewed it)
== baseline, after the owner pins each tool
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message
  exposed  lookup_note   as standin__lookup_note
== a v1 SDK server, client in auto mode: negotiated 2025-11-25
  exposed  lookup_note   as oldie__lookup_note
  {"source":"outside content","text":"lookup_note ran with {\"id\":\"n1\"}"}
== description, untrusted server
  stopped  get_forecast  (hash changed: waits for the owner)
  exposed  send_message  as standin__send_message
  exposed  lookup_note   as standin__lookup_note
== description, untrusted server, after the owner approves the change
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message
  exposed  lookup_note   as standin__lookup_note
== input-schema, untrusted server
  exposed  get_forecast  as standin__get_forecast
  stopped  send_message  (hash changed: waits for the owner)
  exposed  lookup_note   as standin__lookup_note
== input-schema, untrusted server, after the owner approves the change
  exposed  get_forecast  as standin__get_forecast
  stopped  send_message  (declared destination to is not in the input schema)
  exposed  lookup_note   as standin__lookup_note
== add-tool, untrusted server
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message
  exposed  lookup_note   as standin__lookup_note
  stopped  delete_all    (new tool: the owner has not reviewed it)
== remove-tool, untrusted server
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message
  removed  lookup_note   notice: the server no longer lists it
== annotations, untrusted server
  exposed  get_forecast  as standin__get_forecast
  stopped  send_message  (hash changed: waits for the owner)
  exposed  lookup_note   as standin__lookup_note
== description, trusted server
  exposed  get_forecast  as standin__get_forecast notice: hash changed: applied, the server is trusted
  exposed  send_message  as standin__send_message
  exposed  lookup_note   as standin__lookup_note
== input-schema, trusted server
  exposed  get_forecast  as standin__get_forecast
  stopped  send_message  (declared destination to is not in the input schema) notice: hash changed: applied, the server is trusted
  exposed  lookup_note   as standin__lookup_note
== add-tool, trusted server
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message
  exposed  lookup_note   as standin__lookup_note
  stopped  delete_all    (new tool: the owner has not reviewed it)
== remove-tool, trusted server
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message
  removed  lookup_note   notice: the server no longer lists it
== annotations, trusted server
  exposed  get_forecast  as standin__get_forecast
  exposed  send_message  as standin__send_message notice: hash changed: applied, the server is trusted
  exposed  lookup_note   as standin__lookup_note
== call standin__get_forecast, conforming result
  {"source":"outside content","structured":{"city":"Oslo","highC":21},"text":"{\"city\":\"Oslo\",\"highC\":21}"}
== call standin__delete_all, never exposed
  {"error":"standin__delete_all is not exposed","source":"outside content"}
== bad structuredContent, the proxy validates against its pin
  {"error":"result breaks the pinned outputSchema: data/highC must be number","source":"outside content"}
== bad structuredContent, the v2 client with its default validator
  client threw: ProtocolError: Structured content does not match the tool's output schema: data/highC must be number
```

## Answers

### 1. What the hash catches

The hash caught all 5 changes. A changed description, a renamed input argument and annotations
changed alone each stopped the tool under the untrusted mode. A new tool stayed stopped under both
modes, because it has no pin and no declaration. A removed tool left the exposed set with a notice,
and its pin was dropped, so a tool that returns later counts as new.

Annotations sit inside the hash, so a server that relabels a send tool as read-only needs the
owner's approval like any other change. The proxy never reads annotations for a decision, as 0017
requires.

### 2. Destination checks under a trusted server

A trusted server's rename of `to` to `recipient` was applied with a notice, and the proxy still
stopped `send_message`, because the owner's declaration lists `to` as the destination. The same
check stopped the tool under the untrusted mode after the owner approved the new hash. An effect
declaration therefore has to name its destination arguments by path, and the proxy has to check
those paths against the schema on every listing, not only when the hash changes.

### 3. Protocol revision

The v2 client in `auto` mode negotiated `2026-07-28` with the v2 server, and `2025-11-25` with the
v1 server, whose tool then ran through the proxy unchanged. On stdio, `auto` mode probes with
`server/discover` on a short-lived sibling process, so each connect to a stdio server spawns it
twice. The default mode is `legacy`, which never probes, so a proxy must set `auto` to reach a
2026-07-28 server.

### 4. Output validation

The v2 client validates `structuredContent` against the tool's `outputSchema` by default. With its
default validator, the bad result threw a `ProtocolError` from `callTool()`. The low-level v2
`Server` sent the bad result without complaint, so a server-side check depends on how the server is
built.

The client validates against the schema from its latest `tools/list`, according to the package
types, not against the version the owner pinned. A proxy that validates against its pins passes the
client a validator that accepts everything and runs its own check. That check returned
`data/highC must be number` as an error, which the proxy turns into a failed call instead of passing
the result on.

## Untested

- A Streamable HTTP server, and a server that sends `notifications/tools/list_changed` while
  connected. Every run here restarted the server on stdio and listed again.
- The client's use of the latest listing as its validation schema comes from the package types; the
  run never changed an `outputSchema` between listing and call.
- Input requests (`InputRequiredResult`), the tasks extension, and authorization. The client fulfils
  input requests by itself by default; a proxy that turns them into proposals sets
  `inputRequired: { autoFulfill: false }`.
- Return-type taint by output field. Every result here is marked outside content as a whole.
- A server that changes what a tool does without changing its listing, which no listing hash can
  catch.
