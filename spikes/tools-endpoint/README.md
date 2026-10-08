# Spike: what nixie's tools look like to the model

This spike serves nixie-style tools to the Claude Agent SDK with every built-in tool off over 3
transports: in-process, a Streamable HTTP server on the v1 MCP SDK, and a Streamable HTTP server on
the v2 MCP server package. It records what the model would receive. A local mock of the Messages API
stands in for the model, so the run needs no credential. Every transport gives the model the same 3
fields per tool: name, description and input schema. nixie metadata in `_meta`, the MCP annotations
and the output schema stay with the CLI. When a tool returns `structuredContent`, the model gets
that object serialized as JSON, and the tool's text block never reaches it. Claude Code speaks MCP
revision 2026-07-28 to a server that accepts it, and falls back to 2025-11-25 otherwise.

## Questions

1. With `tools: []`, what tool list does the CLI send to the model, for each transport? Does
   anything beyond name, description and input schema reach the model?
2. Which MCP revision does the CLI ask an HTTP server for, and which revision does it settle on with
   a v1 server, a v2 server and the SDK in-process server?
3. When a tool returns `structuredContent` with a text block, `structuredContent` alone, or
   `isError: true`, what does the model receive? Does a v2 server change it?
4. Can nixie carry its own declarations on a tool, such as effects, without the model seeing them?
5. What does the init message report when the HTTP server is unreachable?

## Versions

| Component                      | Version |
| ------------------------------ | ------- |
| Claude Agent SDK               | 0.3.293 |
| Claude Code                    | 2.1.293 |
| `@modelcontextprotocol/sdk`    | 1.32.1  |
| `@modelcontextprotocol/server` | 2.3.1   |
| zod                            | 4.6.5   |
| Bun                            | 1.4.2   |

## Setup

[`mock.ts`](./mock.ts) serves `POST /v1/messages` on `127.0.0.1` and records each request. It
streams Server-Sent Events when the request asks for a stream. Its first reply calls the target
tool, found in the request's tool list by suffix. Once a `tool_result` arrives, it replies with text
and `end_turn`. Any other path gets 404.

[`tools.ts`](./tools.ts) registers 3 tools with raw zod shapes, which both MCP server lines accept.
Each carries nixie's own declaration in `_meta` (`nixie/effects`, `nixie/destinations`,
`nixie/content`) and MCP annotations:

- `price_text` declares an output schema and returns `structuredContent` plus a text block that
  starts with the marker `price-text-block`.
- `price_bare` declares the same output schema and returns `structuredContent` with no content
  blocks.
- `always_fails` returns `isError: true` with a policy-style refusal.

[`run.ts`](./run.ts) runs one `query()` per tool and transport, 9 in all, with `tools: []`,
`strictMcpConfig: true`, `settingSources: []`, `allowedTools` set to the 3 tools, a fresh `cwd`, and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `options.env` replaces the CLI environment with
`PATH`, a fresh `HOME` and `CLAUDE_CONFIG_DIR`, the mock as `ANTHROPIC_BASE_URL`, and a dummy
`ANTHROPIC_API_KEY`, so no token from the shell or the repo's `.env` reaches the CLI.

- **In-process:** `createSdkMcpServer` with the tools registered on its `instance`. A tap on the
  transport logs every JSON-RPC message both ways.
- **HTTP, v1:** a stateless `WebStandardStreamableHTTPServerTransport` from the v1 SDK, built per
  request, in [`endpoints.ts`](./endpoints.ts).
- **HTTP, v2:** `createMcpHandler` from the v2 server package, which serves 2026-07-28 and serves a
  2025-era request through a stateless fallback.

Both HTTP endpoints log each request with its `MCP-Protocol-Version` header and arrival time, and
each response with its status. A tenth run points the HTTP client at a closed port. Last, the script
connects to a fresh in-process server over an in-memory transport and sends `initialize` for
2026-07-28 and for 2025-11-25.

## Run it

```bash
cd spikes/tools-endpoint && bun install
env -u CLAUDE_CODE_OAUTH_TOKEN -u ANTHROPIC_API_KEY bun run.ts
```

The script writes one JSON file per run to `results/`, which git ignores, and stops every server on
exit.

## Results

Every run listed the same tools and reported the server as connected:

```text
== in-process price_text: {"mcp_servers":[{"name":"nixie","status":"connected","source":"sdk"}],"tools":["mcp__nixie__always_fails","mcp__nixie__price_bare","mcp__nixie__price_text"]}
== http price_text: {"mcp_servers":[{"name":"nixie","status":"connected","source":"dynamic"}],"tools":["mcp__nixie__always_fails","mcp__nixie__price_bare","mcp__nixie__price_text"]}
== http-v2 price_text: {"mcp_servers":[{"name":"nixie","status":"connected","source":"dynamic"}],"tools":["mcp__nixie__always_fails","mcp__nixie__price_bare","mcp__nixie__price_text"]}
== http unreachable: {"mcp_servers":[{"name":"nixie","status":"failed","source":"dynamic"}],"tools":[]}
```

### What the model received

The mock received only `POST /v1/messages`, 2 per tool run, both streamed, and all 9 runs ended as
`success` in 2 turns. Each tool in the request held 3 keys:

```json
{
  "name": "mcp__nixie__price_text",
  "description": "Return the price on a product page, as structured content and as text.",
  "input_schema": {
    "type": "object",
    "properties": { "url": { "type": "string", "description": "The product page URL" } },
    "required": ["url"],
    "$schema": "http://json-schema.org/draft-07/schema#"
  }
}
```

The in-process and v1 tool lists were identical. The v2 tool list differed from them in one line per
tool, the `$schema` that each server line adds when it converts the zod shape:

```text
<       "$schema": "http://json-schema.org/draft-07/schema#",
>       "$schema": "https://json-schema.org/draft/2020-12/schema",
```

Each server sent the CLI the full tool, with `annotations`, `_meta` and `outputSchema`:

```json
{
  "name": "price_text",
  "annotations": { "openWorldHint": true, "readOnlyHint": true, "title": "Look up a price" },
  "_meta": {
    "nixie/content": { "price": "outside", "seller": "outside" },
    "nixie/destinations": [],
    "nixie/effects": ["fetch"]
  },
  "outputSchema": {
    "type": "object",
    "properties": { "currency": { "type": "string", "description": "ISO 4217 code" }, "...": "..." }
  }
}
```

A search of every request body sent to the mock, on all 3 transports, found none of the markers
`nixie/effects`, `readOnlyHint`, `Look up a price` (the annotation title), `ISO 4217` (an output
schema description) or `price-text-block` (the text block).

The `tool_result` blocks that reached the mock were the same for all 3 transports, shown here
without the CLI's own token-count reminder:

```text
price_text:   "content":"{\"currency\":\"EUR\",\"price\":12.5,\"seller\":\"Example Shop\"}"
price_bare:   "content":"{\"currency\":\"EUR\",\"price\":7.25,\"seller\":\"Bare Shop\"}"
always_fails: "content":"denied by policy: rule r-17 asks before sending","is_error":true
```

The v2 server added `resultType: "complete"` and its `serverInfo` in `_meta` to each result. The SDK
message stream passed that `_meta` to nixie in `tool_use_result`, and the model never saw it.

### What the MCP servers saw

The v1 server saw this sequence for each run, with times from the first request:

```text
   0 ms  server/discover            MCP-Protocol-Version: 2026-07-28  -> error: Unsupported protocol version
  13 ms  initialize                 protocolVersion 2025-11-25        -> 2025-11-25
  19 ms  notifications/initialized  MCP-Protocol-Version: 2025-11-25
  21 ms  GET (the stream)           MCP-Protocol-Version: 2025-11-25
  22 ms  tools/list                 MCP-Protocol-Version: 2025-11-25
  98 ms  tools/call                 MCP-Protocol-Version: 2025-11-25
```

The v2 server saw this sequence for each run:

```text
   0 ms  server/discover            MCP-Protocol-Version: 2026-07-28  -> supportedVersions ["2026-07-28"]
  16 ms  subscriptions/listen       MCP-Protocol-Version: 2026-07-28  -> stream: subscriptions/acknowledged
  19 ms  tools/list                 MCP-Protocol-Version: 2026-07-28
  92 ms  tools/call                 MCP-Protocol-Version: 2026-07-28
```

The `subscriptions/listen` request asked for `toolsListChanged` notifications and stayed open for
the run. Each request on the 2026-07-28 path carried the protocol version, client identity and
capabilities in `_meta`:

```json
{
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { "name": "claude-code", "version": "2.1.293" },
  "io.modelcontextprotocol/clientCapabilities": {
    "roots": { "listChanged": true },
    "elicitation": { "form": {}, "url": {} }
  }
}
```

Every `tools/call`, on all 3 transports, carried `claudecode/toolUseId` in `_meta`, and its value
matched the `tool_use_id` of the `tool_result` that reached the mock, such as `toolu_b44b20cd`.

A first version of the v2 endpoint logger read each response body before it returned the response,
which held back the `subscriptions/listen` stream. The CLI then waited 25 s, sent
`notifications/cancelled` for the listen request, and only then called `tools/list`, on every run.
The logger now reads bodies without blocking the response.

The in-process transport skipped the probe: the CLI sent `initialize` with 2025-11-25 and empty
capabilities, and the server answered 2025-11-25. The direct probe got 2025-11-25 back for both the
2026-07-28 and the 2025-11-25 request.

## Answers

### 1. The tool list

With `tools: []`, the model received only nixie's 3 tools, named `mcp__nixie__<tool>`, and no
built-in tool. Each tool reached the model as name, description and input schema, unchanged from the
server. The only difference across transports was the `$schema` line: draft-07 from the v1 SDK, and
2020-12 from the v2 server.

### 2. MCP revisions

Claude Code 2.1.293 probes an HTTP server with `server/discover` at 2026-07-28 first. A v2 server
accepts it, and every later request speaks 2026-07-28 with no `initialize`: the CLI opens a
`subscriptions/listen` stream for tool-list changes, then lists and calls tools. A v1 server refuses
the probe, and the CLI falls back to `initialize` at 2025-11-25. The in-process server is a v1
`McpServer` from `@modelcontextprotocol/sdk`, which returns 2025-11-25 to any `initialize` and does
not implement 2026-07-28.

The CLI waits for the listen stream to be acknowledged before it lists tools. An endpoint, proxy or
relay that buffers a streamed response until it ends adds about 25 s to the start of every run.

### 3. Results that reach the model

When a result holds `structuredContent`, the model receives that object serialized as JSON, and the
CLI drops the content blocks. The text block from `price_text` never reached the mock. A result with
`structuredContent` and no content blocks reached the model the same way. An `isError: true` result
reached the model as a `tool_result` with `is_error: true` and the text word for word, as the
[placement spike](../sdk-placement/README.md#3-how-a-deny-reaches-the-model) found. A v2 server
changes none of this. The SDK message stream gives nixie both forms in `tool_use_result`: the
serialized `content` and the `structuredContent` object.

So a tool cannot send the model a typed object and a different text rendering of it. A tool that
wants the model to read prose returns content blocks without `structuredContent`; a typed result
reaches the model as its JSON.

### 4. nixie declarations on the tool

nixie can keep its declarations on the tool definition. `_meta`, `annotations` and `outputSchema`
reached the CLI in `tools/list` and never reached the model, on every transport. The SDK init
message reports annotations and only the MCP Apps members of `_meta` to the SDK host, by the SDK
type definitions, so nixie keeps its registry as the source of its declarations rather than reading
them back from the CLI.

Each `tools/call` carries `claudecode/toolUseId`, which equals the `tool_use_id` in the model's
transcript. nixie's endpoint can record it, so a tool call joins the model turn that made it.

### 5. An unreachable server

The init message reported `"status":"failed"` and an empty tool list, and the run still ended as
`success`, as the placement spike found. nixie has to check `init.mcp_servers` and stop the run.

## Untested

- A real model. The mock shows what the request holds, not how a model reads a JSON result.
- A `structuredContent` that fails the output schema. The v1 server validates its own output before
  sending it, and the spike did not check whether the CLI validates it too.
- A `notifications/tools/list_changed` sent on the v2 listen stream mid-run.
- The in-process tool timeout, and parallel tool calls on any transport.
- Paths other than `/v1/messages` that the CLI calls when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  is off. The mock would answer them with 404.
