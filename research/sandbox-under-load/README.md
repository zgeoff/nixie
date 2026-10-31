# Spike: the sandbox under load

This spike runs Agent SDK turns in an imp under imp's broker, with nixie's options and stub tools
over HTTP MCP. It replaces the model secret during a long turn, and asks the model for parallel tool
calls. It informs the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md) under decision
[0003](../../docs/decisions/0003-sdk-placement.md).

## Question

Does a long turn survive a token rotation mid-turn under imp's broker, so that the sandbox adapter
needs no rotation handling of its own? Do parallel tool calls over HTTP MCP work, so that the
adapter can let the model call tools in parallel?

## Answer

- A turn survives a replace of its secret with a valid value, during a model request or between
  requests: the broker reads the value per request [measured].
- A model request that meets a refused value ends the turn within about 2 s: the CLI retries once,
  then returns `is_error: true` with `authentication_failed` [measured].
- The HTTP MCP route serves 3 calls at once, and the model batches 3 calls in one message
  [measured].
- The CLI runs a batch in parallel only for a tool with `readOnlyHint: true`: 3 calls took 3.4 s
  with it and 9.0 s without [measured].
- nixie's tools carry no annotations, so the CLI runs them one at a time [read in the code].

Store each rotated value only once it is valid, and add `readOnlyHint` to the tools that are safe to
run together.

## Run it

```bash
cd research/sandbox-under-load
export SPIKE_WORK=<scratch_dir>
CLAUDE_CODE_OAUTH_TOKEN=$(op read 'op://nixie/claude-code-oauth-token/credential') bun run spike
bun run summary
```

The run creates one imp and one secret on the current saved imp host. The [setup](results.md#setup)
gives the versions, the rotations and the run steps.

## Results

The [results](results.md) hold the rotation timeline, the retry table and the parallel calls table.

## Untested

The batch order, nixie's own credential headers, and imp's `oauth` secret kind. The
[untested list](results.md#untested) gives the rest.
