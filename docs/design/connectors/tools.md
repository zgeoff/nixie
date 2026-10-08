# Serving nixie's tools

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0003](../../decisions/0003-sdk-placement.md), [0005](../../decisions/0005-effects-and-taint.md),
  [0016](../../decisions/0016-own-interfaces.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

nixie's tools run in nixie's process on the host, and the model reaches them only through MCP. Every
model loop sets `tools: []`, which removes every built-in tool of the Agent SDK, so the tools nixie
serves are the only tools the model has, under [0003](../../decisions/0003-sdk-placement.md). The
conversation and every worker run inside an imp under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md), so in production the model
reaches the tools over HTTP MCP through the route that the
[sandbox adapter](./sandbox-adapter.md#the-route-to-nixies-tools) opens. Everything in this doc
beyond the decisions it links is a proposal.

## A tool definition

A tool is code with a declaration. Connectors, the MCP proxy and nixie's own features all define
tools the same way, and the shape below is a sketch in TypeScript.

```ts
interface ToolDefinition<Input, Output> {
  name: string; // such as 'gmail_send'; the model sees 'mcp__nixie__gmail_send'
  description: string;
  input: JsonSchema;
  output: JsonSchema; // the typed result; free-text fields are strings
  declaration: EffectDeclaration; // effects, destinations, amount, free text, source per field
  execution: 'direct' | 'queued';
  run(call: ToolCall<Input>, context: ToolContext): Promise<ToolOutcome<Output>>;
}
```

The declaration belongs to policy: the [policy decision point](../policy/decision-point.md#effects)
sets the effects, the destination, amount and free-text arguments, and the source of each result
field. A tool whose effects include `write`, `delete`, `send`, `spend` or `device` runs `queued`, as
an [outside action](../core/outside-actions.md) with an ID and an outcome. Every other tool runs
`direct` inside the turn. **Why:** an outside action needs the queue's attempts and reconciliation,
and a read retried after a crash repeats nothing.

Every call runs the same steps on the host:

1. The endpoint checks the call's input against the tool's input schema, and a call that fails
   returns an error to the model without reaching policy.
2. The tool asks the policy decision point, under [0002](../../decisions/0002-approvals.md).
3. A denied call returns the rule and its sentence as an error result, and an ask returns "pending
   approval as <id>".
4. An allowed `direct` call runs. An allowed `queued` call joins the queue, as
   [outside actions](../core/outside-actions.md#from-tool-call-to-queue) covers.
5. nixie writes the call, the decision and the result as records, with the source of content on
   every result field.

## What the model sees of a result

A tool returns its typed result as MCP `structuredContent`, and the model receives that object as
JSON. The [tools endpoint spike](../../../spikes/tools-endpoint/README.md) ran Claude Code 2.1.293
against a local stand-in for the model API, and found:

- The model saw each tool as its name, its description and its input schema, and nothing else. The
  output schema, the MCP annotations and nixie's own fields in `_meta` reached the CLI and never the
  model.
- When a tool returned `structuredContent` and a text block, the model received the object as JSON,
  and the text block never reached it.
- An error result reached the model word for word, with `is_error` set.

nixie therefore puts every field the model needs in the typed result, free text included, and writes
no separate prose version. A free-text field, such as an email body, is a string field whose source
is outside content. The tool's declaration lives in nixie's registry, never only in `_meta`, because
the SDK reports back only part of `_meta` in its init message.

An approval that a call needs, a queued action and a denial reach the model as results of their own:

| Outcome         | Result                                               | Error |
| --------------- | ---------------------------------------------------- | ----- |
| Allowed, direct | The tool's typed result                              | No    |
| Allowed, queued | The action's outcome, or "queued as <id>" after 10 s | No    |
| Ask             | "pending approval as <id>"                           | No    |
| Deny            | The rule's ID and sentence                           | Yes   |
| Invalid input   | The schema errors                                    | Yes   |

[Outside actions](../core/outside-actions.md#what-the-model-sees) set what each outcome of a queued
action holds.

## One endpoint per run

Each run gets an MCP endpoint that lists only the tools on its caller's list: the job's list for a
job run, the conversation's list for the conversation, and the subset its caller passed for a
worker, under [0005](../../decisions/0005-effects-and-taint.md). The decision point still checks the
caller's list at its scope stage, so the endpoint's list narrows what the model sees, and the check
holds whatever the endpoint lists. **Why:** a tool the model never sees costs no prompt tokens and
no failed call.

The endpoint is a stateless Streamable HTTP MCP server in nixie's process, keyed by the run. On imp,
nixie knows the run from the reverse forward the connection came through, and the endpoint also
checks a bearer token that the run's process receives at start. The token is random per run, and
nixie revokes it when the run ends.

## Starting a model loop

Every model loop starts with the same options, from the
[placement spike](../../../spikes/sdk-placement/README.md) and the
[imp worker spike](../../../spikes/imp-worker-start/README.md):

- `tools: []`, `strictMcpConfig: true` and `settingSources: []`, so the model has nixie's tools and
  nothing from a settings file
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, which keeps Claude Code to the model API's host
- a neutral working directory, because the system prompt carries it even with every built-in tool
  off
- `options.env` with each variable passed by name, because it replaces the CLI environment

nixie stops the run when `init.mcp_servers` shows its server as anything but `connected`. **Why:**
in the placement spike, a failed MCP server still ended the run as `success`, and the model invented
a tool's output. The tools endpoint spike saw the same with an unreachable server: the init message
reported it as `failed`, and the run ended as `success`.

Claude Code 2.1.293 asks an HTTP MCP server for revision 2026-07-28 with `server/discover` first,
and falls back to `initialize` at 2025-11-25 when the server refuses, as the tools endpoint spike
found. Against a server on the v2 MCP package, it used 2026-07-28 for every request, the tool calls
completed, and the model saw the same tools and results as with the v1 package. The in-process
server speaks 2025-11-25 only, because the SDK builds it on the v1 package.

On 2026-07-28, the CLI opens a `subscriptions/listen` stream and waits for its acknowledgement
before it lists the tools. A relay that buffers a streamed response therefore stalls the start of
every run, by 25 s in the spike, so nixie's relay for the reverse forward passes each chunk on as it
arrives.

Every `tools/call` carries the model's tool-use ID in `_meta`, as `claudecode/toolUseId`, on both
routes. The endpoint writes it on the tool call's record, which joins the call to the turn that made
it.

## The in-process route

`createSdkMcpServer` serves the same tool definitions inside the process that runs `query()`, with
no network at all, and the placement spike ran a 4-step task through it under Bun. After
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md), no production model loop
with nixie's tools runs on the host, so nixie uses the in-process route for the scripted scenarios
and tests that run `query()` against nixie's tools without an imp. Both routes serve one set of
definitions, so a test on the in-process route exercises the same handlers as production.
