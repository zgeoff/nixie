# Spike: the sandbox under load

This spike runs Agent SDK turns in an imp, where impd's broker adds the model token to each request,
with nixie's stub tools over HTTP MCP (Model Context Protocol). It rotates the model secret during a
long turn, and asks the model for parallel tool calls. It informs the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md), which follows
decision [0003](../../docs/decisions/0003-sdk-placement.md) on where the SDK runs.

## Question

Does a long turn survive a token rotation mid-turn under imp's broker, so that the sandbox adapter
needs no rotation handling of its own? Do parallel tool calls over HTTP MCP work, so that the
adapter can let the model call tools in parallel?

## Answer

- A turn survives a rotation to a valid value, during a model request or between requests, because
  the broker reads the value per request [measured].
- When the API refuses the value at a model request, Claude Code retries once, then ends the turn
  with `is_error: true` and `authentication_failed` within about 2 s [measured].
- The HTTP MCP route serves 3 calls at once, and the model batches 3 calls in one message
  [measured].
- Claude Code runs a batch in parallel only for a tool with the MCP annotation `readOnlyHint: true`:
  3 calls took 3.4 s with it and 9.0 s without [measured].
- nixie's run server lists its tools with no annotations, so Claude Code runs them one at a time
  [read in the code].

The sandbox adapter needs no rotation handling when nixie stores each new value only once it is
valid, and nixie's tools run in parallel only once they carry `readOnlyHint`.

## Run it

```bash
cd research/sandbox-under-load
export SPIKE_WORK=<scratch_dir>
CLAUDE_CODE_OAUTH_TOKEN=$(op read 'op://nixie/claude-code-oauth-token/credential') bun run spike
```

The run creates one imp and one secret on the imp host that `impz login` saved as current, and
removes both on exit. The [setup](results.md#setup) gives the versions, the rotations, the expected
output and the summary command.

## Results

The [results](results.md) hold the rotation timeline, the retry table and the parallel calls table.

## Untested

The order of the 2 batches, nixie's own credential variables, and imp's `oauth` secret kind. The
[untested list](results.md#untested) gives the rest.
