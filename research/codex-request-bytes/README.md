# Spike: what the Codex CLI sends the model

This spike records the exact body of each model request that the Codex CLI sends on a nixie task
turn, and gives each byte its source: nixie, Codex, the model's own output or metadata. It runs the
production Codex guest with nixie's own config and model catalog against a local stub, so no request
reaches a model and nothing is spent.

## Question

What does the Codex CLI add to a nixie Codex turn, byte by byte, and which settings remove what
nixie never asked for?

## Answer

- The model reads no Codex system prompt. With the guest's config and catalog, a task turn's first
  request holds nixie's task prompt, the turn's message, nixie's 5 tool schemas and 488 bytes of
  Codex tool text, about 119 tokens.
- That Codex text was 1,973 bytes, about 400 tokens, before this spike. The guest's catalog now
  empties the text of the 3 MCP resource helpers, which cut 1,485 bytes, about 281 tokens, from each
  request.
- What stays cannot go: the 3 helpers' names, the namespace line, and a 36-byte wall-time header on
  each tool result. Codex adds each one with no setting to turn it off.
- On a plan login, the CLI's analytics upload to `chatgpt.com` stops under the guest's new
  `[analytics]` table. When the plan account turns on commit attribution, Codex adds a 1,125-byte
  developer message, and only the broker's refusal of that settings path keeps it out.
- Without nixie's catalog, the CLI's bundled entry adds 9,448 bytes, about 2,444 tokens. That entry
  makes up most of the 2,767 input tokens that the [codex-app-server](../codex-app-server/) spike's
  first call read, because that spike wrote no catalog.

## Run it

Run from this directory, with the Codex CLI 0.166.0 binary in a folder of its own.

```bash
bun install
CODEX_BIN_DIR=<folder with codex 0.166.0> bun run.ts final all
bun report.ts final
```

## Results

The [results](results.md) hold the setup, the table of every part, the before and after, the
settings with their place in the Codex source, and the proposed capture of one real plan request.

## Untested

The real model API's answer to an empty tool description, a real plan request, compaction and later
turns. The [untested list](results.md#untested) gives the rest.
