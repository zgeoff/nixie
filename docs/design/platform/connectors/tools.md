# Serving nixie's tools

- Decisions: [0003](../../../decisions/0003-sdk-placement.md),
  [0026](../../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0030](../../../decisions/0030-connectors-and-sandbox-environments.md)

nixie's tools run in nixie's process on the host, and the model reaches them only through MCP. Every
model loop sets `tools: []`, which removes the Agent SDK's built-in tools, so nixie's tools are the
only tools the model has. The conversation and every worker run inside an imp, so the model reaches
the tools over HTTP MCP through the route the [sandbox adapter](sandbox-adapter.md) opens.

## A tool definition

Connectors, the MCP proxy and nixie's own features define tools the same way:

```ts
interface ToolDefinition<Input, Output> {
  name: string; // such as 'gmail_send'; the model sees 'mcp__nixie__gmail_send'
  description: string;
  input: JsonSchema;
  output: JsonSchema; // the typed result; free-text fields are strings
  declaration: EffectDeclaration; // owned by policy
  execution: 'direct' | 'queued';
  run(call: ToolCall<Input>, context: ToolContext): Promise<ToolOutcome<Output>>;
}
```

The [policy decision point](../policy/decision-point.md) owns the declaration. A tool whose effects
include `write`, `delete`, `send`, `spend` or `device` runs `queued`, as an
[action](../core/actions.md) with an ID and an outcome. Every other tool runs `direct` in the turn,
because a read retried after a crash repeats nothing.

Every call runs the same steps on the host:

1. The endpoint checks the input against the input schema, and a failure returns an error without
   reaching policy.
2. The tool asks the policy decision point.
3. A denied call returns the rule and its sentence as an error, and an ask returns "pending approval
   as <id>".
4. An allowed `direct` call runs, and an allowed `queued` call joins the action queue.
5. nixie writes the call, the decision and the result as records, with the source of content on
   every result field.

## What the model sees

A tool returns its typed result as MCP `structuredContent`, and the model receives that object as
JSON. The model never sees a text block beside it, the output schema, the annotations or `_meta`, as
the [tools endpoint spike](../spikes/tools-endpoint/README.md) found. Every field the model needs is
therefore in the typed result, free text included, and the declaration lives in nixie's registry.

| Outcome         | Result                                               | Error |
| --------------- | ---------------------------------------------------- | ----- |
| Allowed, direct | The tool's typed result                              | No    |
| Allowed, queued | The action's outcome, or "queued as <id>" after 10 s | No    |
| Ask             | "pending approval as <id>"                           | No    |
| Deny            | The rule's ID and sentence                           | Yes   |
| Invalid input   | The schema errors                                    | Yes   |

## One endpoint per task run

Each task run and each worker run gets an MCP endpoint that lists only the tools on its caller's
list: the job's list for a job run, the conversation's list for the conversation, and the subset the
caller passed for a worker. The decision point still checks the list, so the endpoint narrows what
the model sees, and the check holds whatever the endpoint lists. A tool the model never sees costs
no prompt tokens.

The endpoint is a stateless Streamable HTTP MCP server on the v2 TypeScript MCP packages, keyed by
the run. nixie knows the run from the reverse forward the connection came through, and also checks a
bearer token, random per run and revoked when the run ends. Every `tools/call` carries the model's
tool-use ID in `_meta` as `claudecode/toolUseId`, which the call's record holds, so the record joins
the call to its turn.

## Starting a model loop

Every model loop starts with the same options, from the
[placement spike](../spikes/sdk-placement/README.md), plus the base URL, model and effort of its
role's [model profile](../core/models.md):

- `tools: []`, `strictMcpConfig: true` and `settingSources: []`, so nothing comes from a settings
  file
- `skills: []`, so the SDK loads no skill and the model has no Skill tool; skills reach the model
  through nixie's [skill tools](../skills.md#the-tools)
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, which keeps Claude Code to the model API's host
- a neutral working directory, because the system prompt carries it
- `options.env` with each variable passed by name, because it replaces the CLI environment

nixie stops the run when `init.mcp_servers` shows its server as anything but `connected`. **Why:** a
failed MCP server still ends the run as `success`, and the model invents the tool's output.

The CLI opens a `subscriptions/listen` stream and waits for its acknowledgement before it lists the
tools, so nixie's relay passes each chunk on as it arrives. A buffering relay stalled the start of
every run by 25 s in the tools endpoint spike.

The SDK's in-process MCP server serves tool definitions with no network. The tests that run
`query()` live in `guests/conversation`, the one package that imports the SDK, and use it to check
the turn runner and the options above without an imp. Those tests serve stub tools, because a guest
never imports a module. A whole-program test exercises the production handlers through the endpoint,
with the sandbox double from the [crash tests](../core/crash-tests.md#the-harness).
