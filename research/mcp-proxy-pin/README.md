# Spike: an MCP proxy that pins tools by hash

This spike builds a minimal version of the proxy that decision
[0017](../../docs/decisions/0017-mcp-proxy.md) puts in front of every outside MCP server, on the v2
TypeScript MCP packages. It runs a stand-in server through a series of changes to its listing and
records what the proxy exposes or stops under each trust mode.

## Question

Does a hash over each tool's listing catch every change to a tool, does a trusted server's applied
change still stop a tool whose declared destination argument is gone, which protocol revision does
the v2 client negotiate, and does the client validate structured content against the output schema
by itself?

## Answer

- The hash caught all 5 changes: a description, a renamed input argument, a new tool, a removed tool
  and annotations changed alone.
- A trusted server's rename of the destination argument `to` was applied with a notice, and the
  proxy still stopped the tool, because the owner's declaration names `to`.
- In `auto` mode the v2 client negotiated `2026-07-28` with a v2 server and `2025-11-25` with a v1
  server; the default `legacy` mode never probes.
- The v2 client rejects `structuredContent` that breaks the output schema by default, against its
  latest listing rather than the pin.

Check declared destination paths against the schema on every listing, set `auto` mode, and validate
results against the pinned schema in the proxy.

## Run it

```bash
cd research/mcp-proxy-pin
bun install
bun run.ts
```

The [setup](results.md#setup) gives the versions, the stand-in server's changes and what the proxy
checks.

## Results

The [results](results.md) hold the proxy's full output per change and trust mode, and the answer to
each question.

## Untested

A Streamable HTTP server, a server that announces a list change while connected, and input requests.
The [untested list](results.md#untested) gives the rest.
