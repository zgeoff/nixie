# Spike: what nixie's tools look like to the model

This spike serves nixie-style tools to the Claude Agent SDK with every built-in tool off, once
in-process and once over a Streamable HTTP MCP server, and records what the model would receive. A
local mock of the Messages API stands in for the model, so the run needs no credential. Both
transports give the model the same 3 fields per tool: name, description and input schema. nixie
metadata in `_meta`, the MCP annotations and the output schema stay with the CLI. When a tool
returns `structuredContent`, the model gets that object serialized as JSON, and the tool's text
block never reaches it. Claude Code speaks MCP revision 2025-11-25 to nixie's server, after probing
for 2026-07-28 first.

## Questions

1. With `tools: []`, what tool list does the CLI send to the model, for an in-process server and for
   an HTTP server? Does anything beyond name, description and input schema reach the model?
2. Which MCP revision does the CLI ask an HTTP server for, and which revision does the SDK
   in-process server answer with?
3. When a tool returns `structuredContent` with a text block, `structuredContent` alone, or
   `isError: true`, what does the model receive?
4. Can nixie carry its own declarations on a tool, such as effects, without the model seeing them?
5. What does the init message report when the HTTP server is unreachable?

## Versions

| Component                   | Version |
| --------------------------- | ------- |
| Claude Agent SDK            | 0.3.293 |
| Claude Code                 | 2.1.293 |
| `@modelcontextprotocol/sdk` | 1.32.1  |
| zod                         | 4.6.5   |
| Bun                         | 1.4.2   |

## Setup

[`mock.ts`](./mock.ts) serves `POST /v1/messages` on `127.0.0.1` and records each request. It
streams Server-Sent Events when the request asks for a stream. Its first reply calls the target
tool, found in the request's tool list by suffix. Once a `tool_result` arrives, it replies with text
and `end_turn`. Any other path gets 404.

[`tools.ts`](./tools.ts) registers 3 tools on one MCP server shape. Each carries nixie's own
declaration in `_meta` (`nixie/effects`, `nixie/destinations`, `nixie/content`) and MCP annotations:

- `price_text` declares an output schema and returns `structuredContent` plus a text block that
  starts with the marker `price-text-block`.
- `price_bare` declares the same output schema and returns `structuredContent` with no content
  blocks.
- `always_fails` returns `isError: true` with a policy-style refusal.

[`run.ts`](./run.ts) runs one `query()` per tool and transport, 6 in all, with `tools: []`,
`strictMcpConfig: true`, `settingSources: []`, `allowedTools` set to the 3 tools, a fresh `cwd`, and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `options.env` replaces the CLI environment with
`PATH`, a fresh `HOME` and `CLAUDE_CONFIG_DIR`, the mock as `ANTHROPIC_BASE_URL`, and a dummy
`ANTHROPIC_API_KEY`, so no token from the shell or the repo's `.env` reaches the CLI.

- **In-process:** `createSdkMcpServer` with the tools registered on its `instance`. A tap on the
  transport logs every JSON-RPC message both ways.
- **HTTP:** a stateless Streamable HTTP server on `127.0.0.1`, built per request, which logs each
  request body and its `MCP-Protocol-Version` header.

A seventh run points the HTTP server at a closed port. Last, the script connects to a fresh
in-process server over an in-memory transport and sends `initialize` for 2026-07-28 and for
2025-11-25.

## Run it

```bash
cd spikes/tools-endpoint && bun install
env -u CLAUDE_CODE_OAUTH_TOKEN -u ANTHROPIC_API_KEY bun run.ts
```

The script writes one JSON file per run to `results/`, which git ignores, and stops both servers on
exit.

## Results

Every run, in-process and HTTP, listed the same tools and the same server status:

```text
== in-process price_text: {"mcp_servers":[{"name":"nixie","status":"connected","source":"sdk"}],"tools":["mcp__nixie__always_fails","mcp__nixie__price_bare","mcp__nixie__price_text"]}
== http price_text: {"mcp_servers":[{"name":"nixie","status":"connected","source":"dynamic"}],"tools":["mcp__nixie__always_fails","mcp__nixie__price_bare","mcp__nixie__price_text"]}
== http unreachable: {"mcp_servers":[{"name":"nixie","status":"failed","source":"dynamic"}],"tools":[]}
```

The mock received only `POST /v1/messages`, 2 per tool run, both streamed. Each tool in the request
held 3 keys, identical for both transports:

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

The server sent the CLI the full tool, with `annotations`, `_meta` and `outputSchema`:

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

A search of every request body sent to the mock found none of the markers `nixie/effects`,
`readOnlyHint`, `Look up a price` (the annotation title), `ISO 4217` (an output schema description)
or `price-text-block` (the text block).

The `tool_result` blocks that reached the mock, the same for both transports, with the CLI's own
token-count reminder cut:

```text
price_text:   "content":"{\"currency\":\"EUR\",\"price\":12.5,\"seller\":\"Example Shop\"}"
price_bare:   "content":"{\"currency\":\"EUR\",\"price\":7.25,\"seller\":\"Bare Shop\"}"
always_fails: "content":"denied by policy: rule r-17 asks before sending","is_error":true
```

The HTTP server saw this sequence for each run:

```text
server/discover            MCP-Protocol-Version: 2026-07-28  -> error: Unsupported protocol version
initialize                 protocolVersion 2025-11-25        -> 2025-11-25
notifications/initialized  MCP-Protocol-Version: 2025-11-25
GET (the stream)           MCP-Protocol-Version: 2025-11-25
tools/list
tools/call
```

The `server/discover` request carried the client identity and capabilities in `_meta`:

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

The in-process transport skipped the probe: the CLI sent `initialize` with 2025-11-25 and empty
capabilities, and the server answered 2025-11-25. The direct probe got 2025-11-25 back for both the
2026-07-28 and the 2025-11-25 request.

## Answers

### 1. The tool list

With `tools: []`, the model received only nixie's 3 tools, named `mcp__nixie__<tool>`, and no
built-in tool. Each tool reached the model as name, description and input schema, unchanged from the
server, with a draft-07 `$schema` that zod's conversion added. The in-process and HTTP transports
produced identical tool lists.

### 2. MCP revisions

Claude Code 2.1.293 probes an HTTP server with `server/discover` at 2026-07-28 first, and falls back
to `initialize` at 2025-11-25 when the server refuses. With a v1 server, every request after the
handshake speaks 2025-11-25. The in-process server is a v1 `McpServer` from
`@modelcontextprotocol/sdk`, which returns 2025-11-25 to any `initialize` and does not implement
2026-07-28.

### 3. Results that reach the model

When a result holds `structuredContent`, the model receives that object serialized as JSON, and the
CLI drops the content blocks. The text block from `price_text` never reached the mock. A result with
`structuredContent` and no content blocks reached the model the same way. An `isError: true` result
reached the model as a `tool_result` with `is_error: true` and the text word for word, as the
[placement spike](../sdk-placement/README.md#3-how-a-deny-reaches-the-model) found. The SDK message
stream gives nixie both forms in `tool_use_result`: the serialized `content` and the
`structuredContent` object.

So a tool cannot send the model a typed object and a different text rendering of it. A tool that
wants the model to read prose returns content blocks without `structuredContent`; a typed result
reaches the model as its JSON.

### 4. nixie declarations on the tool

nixie can keep its declarations on the tool definition. `_meta`, `annotations` and `outputSchema`
reached the CLI in `tools/list` and never reached the model. The SDK init message reports
annotations and only the MCP Apps members of `_meta` to the SDK host, by the SDK type definitions,
so nixie keeps its registry as the source of its declarations rather than reading them back from the
CLI.

### 5. An unreachable server

The init message reported `"status":"failed"` and an empty tool list, and the run still ended as
`success`, as the placement spike found. nixie has to check `init.mcp_servers` and stop the run.

## Untested

- A real model. The mock shows what the request holds, not how a model reads a JSON result.
- A v2 MCP server that accepts `server/discover`. The CLI would then speak 2026-07-28, and this
  spike did not check whether tool calls behave the same.
- A `structuredContent` that fails the output schema. The v1 server validates its own output before
  sending it, and the spike did not check whether the CLI validates it too.
- The in-process tool timeout, and parallel tool calls on either transport.
- Paths other than `/v1/messages` that the CLI calls when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  is off. The mock would answer them with 404.
