# 0002: Actions and approvals

- Date: 2026-10-07
- Status: decided
- Research: [defer and hold spike](../design/platform/spikes/sdk-long-hold/),
  [engine notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.2-notes/engines.md)

Every action runs through one of nixie's own tools, and an action that needs your approval becomes a
proposal that ends the turn:

1. The tool asks the policy decision point.
2. An allowed action runs once, under an ID that nixie creates.
3. An action that needs approval becomes a proposal with that ID, and the tool returns "pending
   approval" to the model. The turn ends.
4. On approval, nixie runs the action as its own step under the same ID, then starts a turn with the
   result.

You approve through an action that nixie checks, such as a button bound to one proposal. A chat
message never counts as an approval, because the model would interpret it, and injected content
could fake one.

The Claude Code mod in the SDK guards the SDK's built-in tools: it denies or rewrites a call at once
and never waits for you. nixie does not use `defer`. A question to you is an ordinary message that
ends the turn, and your reply starts the next one. An external MCP server reaches the model only
through nixie's proxy under [0017](0017-mcp-proxy.md).

## Why

You can keep talking while an action waits. A message such as "make it 8:30" starts a new turn at
once, and the model can withdraw a proposal and post a new one. A hold in the mod or a parked
`defer` call blocks the session until you answer, so you cannot change the request first.

A proposal survives a restart, works with parallel tool calls, and keeps every action in nixie's
record on the event log from [0001](0001-durable-layer.md).

## Alternatives

- **A hold in the mod.** The model sees the result in the same turn, and the session blocks until
  you answer. A restart loses the call as "outcome unknown". A hook has 10 s of its own time, and
  one `$.http.fetch` aborts at 30 s. The mod can fail open.
- **`defer` and resume.** It survives a restart, and the session blocks until you answer. In the
  spikes it lost calls from a parallel batch, and the hooks docs state that `defer` "only works when
  Claude makes a single tool call in the turn"
  ([hooks docs](https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later)).

## Consequences

- A task that waits on approval continues in a later turn, and the event log and the SDK session
  carry its plan across.
- A built-in SDK action that needs approval becomes one of nixie's own tools.
