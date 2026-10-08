# 0002: Outside actions and approvals

- Date: 2026-10-07
- Status: decided, amended by [0017](./0017-mcp-proxy.md)
- Research: [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#owner-approvals),
  [engine notes](../research/2.2-notes/engines.md#recommendation),
  [defer and hold spike](../../spikes/sdk-long-hold/)

An action that needs the owner's approval becomes a proposal, and the turn ends. Every outside
action runs through nixie's own tools:

1. The tool asks the policy decision point.
2. An allowed action runs once, under an ID that nixie creates.
3. An action that needs approval becomes a proposal with that ID, and the tool returns "pending
   approval" to the model. The turn ends.
4. On approval, nixie runs the action as its own step under the same ID, then starts a turn with the
   result.

The owner approves through an action that nixie checks, such as a button bound to one proposal. A
chat message never counts as an approval, because the model would interpret it, and injected content
could fake one.

The Claude Code mod in the SDK guards the SDK's built-in tools: it denies or rewrites a call at once
and never waits for the owner. nixie does not use `defer`. A question to the owner is an ordinary
message that ends the turn, and the owner's reply starts the next one.

## Why

The owner can keep talking while an action waits. A message such as "make it 8:30" starts a new turn
at once, and the model can withdraw a proposal and post a new one. A hold in the mod or a parked
`defer` call blocks the session until the owner answers, so the owner cannot change the request
first.

A proposal survives a restart, works with parallel tool calls, and keeps every outside action in
nixie's record. It fits the event log from [0001](./0001-durable-layer.md).

## Alternatives

- **A hold in the mod.** The model sees the result in the same turn, but the session blocks until
  the owner answers. A restart loses the call as "outcome unknown". A hook has 10 s of its own time
  and one `$.http.fetch` aborts at 30 s, so longer waits rely on hook-time accounting that no doc
  states. The mod can fail open.
- **`defer` and resume.** It survives a restart, but the session blocks until the owner answers. In
  the spikes it lost calls from a parallel batch. The hooks docs state instead that `defer` "only
  works when Claude makes a single tool call in the turn" and is ignored with a warning otherwise
  ([hooks docs](https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later), 2026-10-07).

## Consequences

- Every outside MCP server reaches the model through nixie's proxy, never directly, under
  [0017](./0017-mcp-proxy.md).
- A task that waits on approval continues in a later turn, and the event log and the SDK session
  carry its plan across.
- A built-in SDK action that needs approval becomes one of nixie's own tools.
