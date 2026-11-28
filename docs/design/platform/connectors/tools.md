# Serving nixie's tools

- Decisions: [0003](../../../decisions/0003-sdk-placement.md)

nixie's tools run in nixie's process on the host, and the model reaches them only through MCP. Every
model loop sets `tools: []`, which removes the Agent SDK's built-in tools, so nixie's tools are the
only tools the model has. The conversation and every worker run inside an imp, so the model reaches
the tools over HTTP MCP through the route the
[sandbox adapter](../../../architecture/connectors/sandboxes.md) opens.

## A tool definition

Connectors, the MCP proxy and nixie's own features define tools the same way:

```ts
interface ToolDefinition<Input, Output> {
  name: string; // such as 'mail.send'; the model sees 'mcp__nixie__mail_send'
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
[action](../../../architecture/core/actions.md) with an ID and an outcome. Every other tool runs
`direct` in the turn, because a read retried after a crash repeats nothing.

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
the
[tools endpoint spike](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes/tools-endpoint/README.md)
found. Every field the model needs is therefore in the typed result, free text included, and the
declaration lives in nixie's registry.

| Outcome                | Result                                               | Error | Retried in the turn       | Text from           |
| ---------------------- | ---------------------------------------------------- | ----- | ------------------------- | ------------------- |
| Allowed, direct        | The tool's typed result                              | No    | No                        | Each field's source |
| Allowed, queued        | The action's outcome, or "queued as <id>" after 10 s | No    | No; the action queue does | Each field's source |
| Ask                    | "pending approval as <id>"                           | No    | No                        | nixie               |
| Deny                   | The rule's ID and sentence                           | Yes   | No                        | nixie               |
| Invalid input          | The schema errors                                    | Yes   | No                        | The model's input   |
| Connection unavailable | `connection_unavailable`, with the status            | Yes   | No                        | nixie               |

[A failed direct call](#a-failed-direct-call) covers the last row. Text from nixie counts as your
own data, and the model's input and the provider's text count as untrusted, as the
[source of content](../policy/decision-point.md#taint-in-the-first-build) sets.

### A failed direct call

[Tool calls](../../../architecture/connectors/tool-calls.md#a-failed-direct-call) describes how a
failed direct call retries and what the model reads. Two parts are not built yet, and
[GEO-2775](https://linear.app/zgeoff/issue/GEO-2775/nixie-connectors-build-or-cut-what-the-tools-design-still-lacks)
tracks them: the connectors outside Google and search that still return their own error text, and
the fields of `connection_unavailable` for a connection whose status stops its tools.

A `connection_unavailable` error carries 4 fields, with the values that the
[status line](#what-the-model-learns-about-a-connection) holds for the connection:

- `status`, the connection's status;
- `reason`, the reason for `failing`, present only when `status` is `failing`;
- `since`, the time its status began;
- `reconnectUrl`, where in the client you reconnect it.

**Why:** the model then knows from the error alone that its call was not wrong, and what you must
do. A call to a tool of a connection that you forgot during the session returns
`connection_unavailable` with none of these fields, so the error names neither the connection nor
its status, as [the statuses](credentials.md#statuses) require of `forgotten`.

## One endpoint per task run

Each task run and each worker run gets an MCP endpoint that lists only the tools on its caller's
list: the job's list for a job run, the conversation's list for the conversation, and the subset the
caller passed for a worker. The list names the connections each connector tool may use, and the
endpoint builds each tool's [connection argument](connector.md#the-connection-argument) from them.
The decision point still checks the list, so the endpoint narrows what the model sees, and the check
holds whatever the endpoint lists. A tool the model never sees costs no prompt tokens.

The endpoint is a stateless Streamable HTTP MCP server on the v2 TypeScript MCP packages, keyed by
the run. nixie knows the run from the reverse forward the connection came through, and also checks a
bearer token, random per run and revoked when the run ends. Every `tools/call` carries the model's
tool-use ID in `_meta` as `claudecode/toolUseId`, which the call's record holds, so the record joins
the call to its turn.

### What the model learns about a connection

The endpoint never lists a stub tool for a connection that stops working, and never removes its
tools in silence. The model reads a status line instead, in 2 places that the session already has.
Each place lists a connection on the caller's list that is `needs_consent`, `disconnected`,
`failing` or `expiring`, and never a `forgotten` one, as [the statuses](credentials.md#statuses)
set.

- **The status entry** joins the [status](../../../architecture/core/session-opening.md#status) in
  the session's first user message, and lists each such connection when the session opens. The model
  credential joins the entry when it is `expiring`, although it has no tools. The entry in a
  [job run](../core/tasks.md#job-runs) leaves it out. The entry renders nothing when every
  connection is `active`.
- **The events-block entry** joins
  [the events block](../../../architecture/core/conversation-turns.md#the-events-block), before the
  next message, with each change into one of the 4 statuses, each return to `active`, and a break
  that has lasted 2 days, once per break. The 2 days are a configurable default.

**Why:** the system prompt and the tool list stay as they were, so the cached prefix holds, and the
status entry costs nothing while every connection is `active`.

Each connection in the line carries:

- its connector, label and account;
- its status, and for `failing` the reason, `unauthorised`, `service_error` or `no_answer`;
- the time its status began, and the time of its last success;
- the tools its status removed, by name up to 5, with a count of the rest;
- where in the client you reconnect it, such as "Settings → Connections".

An event for a return to `active` also counts the calls that failed during the break and the job
runs that ran without the connection, such as "2 calls failed, 1 job run ran without it". nixie
keeps both counts over each break. **Why:** the return tells the model to stop reporting the fault,
and the counts tell it what failed, so it never assumes everything ran. Every time in the line shows
the date, the time and the zone, in the zone that the time tool answers in, because the model reads
a bare time wrongly.

The line holds only values: names, statuses, times and counts. Its sentences, the reconnect place
and the rule below are template text from nixie's definitions, so a change to the client's reconnect
place changes the template. The provider's refusal text, such as an `invalid_grant` detail, never
enters the line.

The rule in the template tells the model when to raise a status:

- Tell you about a connection that needs attention when a request needs it, or when you ask.
- On the event for a break that has lasted 2 days, tell you once, at a natural moment.
- Raise a `disconnected` connection only when a request needs it, because you chose it.
- Mention an expiry only when it falls within the time a request covers, or when you ask. The model
  credential is the exception: tell you once, unprompted, 3 days before it expires, by default.
- Say each of these once per session.

**Why:** a break that you never meet in a request would stay broken for weeks under a rule that
waits for a request, so one event past 2 days gives one mention without a reminder in every session.
nixie tracks the time, because the model cannot see what it said in an earlier session. The model
credential keeps the assistant running and no request covers its expiry, so the model warns once
ahead.

A `failing` connection keeps its tools listed, so a call can succeed once the connection recovers. A
call that a status stops returns [`connection_unavailable`](#a-failed-direct-call). A job run starts
whatever the status of its pinned connections, and its result says what it skipped, as
[job runs](../core/tasks.md#job-runs) sets out.

## Starting a model loop

The conversation's model loop is built, and
[conversation turns](../../../architecture/core/conversation-turns.md#what-a-query-holds) covers the
options every query holds. A worker's model loop starts with the same options, on its role's
[model profile](../core/models.md).
