# Tool calls

A model loop reaches nixie's tools through a tool endpoint that serves the Model Context Protocol
(MCP), under [0003](../../decisions/0003-sdk-placement.md). The endpoint serves one tool run: the
conversation, one task or one worker run, which it knows by its run ID. The model loop runs inside a
sandbox, and the tools run on the host, so the endpoint is the one place where what the model asks
for meets what nixie lets happen. Every call passes the tool run's tool list, the tool's input
schema and the [decision point](../policy/decision-point.md) before it runs, and nixie records the
call, its decision and its result in the [event log](../core/event-log.md). `modules/tools` owns the
endpoint and the tool registry. [Sandboxes](./sandboxes.md) covers the route a guest's connection
takes to reach the endpoint, and [actions](../core/actions.md) covers what happens to a call that
acts outside nixie.

## One endpoint per run

Each tool run gets an endpoint of its own: a Unix socket of its own and a bearer token. The socket a
connection arrives on decides its tool run, and the token is a second check. The sandbox adapter
relays every guest connection to the socket of the tool run that owns the sandbox, so a guest never
picks its tool run, whatever it claims. A request with any other token, another tool run's included,
gets a 401. Stopping an endpoint revokes its token, closes every open stream and removes the socket,
and an endpoint started again for the same run ID gets a fresh token. A task's endpoint can serve
several of its task runs, so a task run that pins another version of its definition gets a new
endpoint, as [the task of a definition](../core/definitions.md#the-task-of-a-definition) describes.

Each turn of the conversation is a task step, and a runner works on a step only while it holds the
step's lease, as [steps](../core/tasks.md#steps) and
[the claim path](../core/leases-and-recovery.md#the-claim-path) describe. The conversation's guest
therefore reaches its endpoint with a step token in place of the tool run's token. The endpoint
issues a step token for each turn and revokes it once the turn ends, and every call that arrives
with it carries the identity of the turn's step: the step key, which identifies the step in the log,
and the generation of the step's lease. Each call carries the key of the conversation session the
turn runs on too, which a tool that keeps something for one session, such as the web fetch tool's
links, keys its rows by.

A runner that takes over an expired lease runs the same step at the next generation, so the guest of
the step it replaced keeps a generation that no longer matches the lease the task holds now. The
action queue checks that identity against the current lease, as
[actions](../core/actions.md#queuing-a-call) covers. A call under the tool run's own token carries
no step identity, so a guest that holds only that token can run direct tools but never queue an
action.

The endpoint answers each request with a new instance of the MCP SDK's low-level `Server` class,
never its high-level `McpServer` class. `McpServer` answers a call to a tool it does not list by
itself, and such a call must still reach the decision point, so that the decision point denies it at
its scope stage and the denial is recorded. The endpoint passes each chunk of a response stream to
the guest as the server writes it, because Claude Code waits for the server's acknowledgement on the
listen stream before it lists tools. The listen stream is the long-lived request on which an MCP
server sends messages of its own, and a relay that buffered it would delay the start of every model
loop. The socket has no idle timeout, because a listen stream stays open for the guest's whole
session.

## A tool definition

The registry refuses a tool definition that breaks one of its rules. A definition holds the name,
the description, the input and output JSON Schemas, the effect declaration, how the tool runs, and
its code. The effect declaration lists what the tool does, such as read, send or spend, and gives
each field of the tool's result a source of content, the origin of what the field holds: the user's
own words (`owner`), the user's own data (`owner_data`), or `untrusted` content.
[Effects and declarations](../policy/decision-point.md#effects-and-declarations) covers the
declaration. The rules are:

- A name appears once.
- The input schema and the output schema both describe objects.
- Every top-level field of the output has a source of content in the declaration, and every declared
  source names a field.
- A tool whose effects reach outside nixie, such as a write, a send or a spend, runs queued as an
  action, and every other tool runs direct. A read retried after a crash repeats nothing, so it can
  run inside the turn.

The model sees each listed tool's name, description and input schema, and nothing else, because
Claude Code shows the model only those three fields. The output schema and the declaration therefore
stay in the registry. The tool's `_meta`, its MCP annotations and its output schema reach Claude
Code in the tool list and never reach the model. That holds on the in-process transport and on
Streamable HTTP servers built on either major version of the MCP SDK.

### Tool names

The Agent SDK shows the model each tool under its SDK name: `mcp__nixie__`, then nixie's own name
with each character outside `a-z`, `A-Z`, `0-9`, `_` and `-` replaced by `_`. So `code.run` shows as
`mcp__nixie__code_run`. The tool list of a task run may name a tool either way. When the task run
starts, the endpoint maps each name to the registered name, and lists each tool once. The model then
sees each tool under its SDK name, as for any other tool. A name that no registered tool has, as its
own name or its SDK name, stays out of the tool list, and the endpoint logs the warning
`tools.run_tool_unknown` with the run ID and the name.

## The call steps

Each call runs through five steps in order:

1. The endpoint checks the input of a listed tool against its input schema. An input that breaks the
   schema never reaches the decision point.
2. It asks the decision point, with the tool run's tool list.
3. It records the call with its decision, before the tool runs.
4. It runs an allowed direct tool, or passes an allowed queued call to the action queue and waits a
   bounded time for its outcome.
5. It checks a typed result against the output schema, and records the result.

A tool missing from the tool run's list skips the schema check, and the decision point denies it at
its registry or scope stage, the first two of [its stages](../policy/decision-point.md#the-stages),
so the model receives the denied outcome. The schema errors of an unlisted tool would otherwise show
the model that the tool exists and what it takes. The action queue is an interface that the tools
module declares and its caller passes in, so tools never imports actions.

A typed result reaches the model as structured content with no content blocks, and every other
outcome as one text block. Claude Code serializes structured content as JSON for the model and drops
any content blocks beside it, so a tool cannot send the model a typed object and a different text
rendering of it:

| Outcome           | What the model receives                                             | Error |
| ----------------- | ------------------------------------------------------------------- | ----- |
| Allowed, direct   | The tool's typed result                                             | No    |
| Allowed, queued   | The action's typed result once it is done                           | No    |
| Queued, not done  | The action ID, once the wait runs out                               | No    |
| Queued, failed    | The action ID and its reason                                        | No    |
| Denied            | The decision point's sentence                                       | Yes   |
| Asked             | "Waiting for approval as `<shortID>`", with the proposal's short ID | No    |
| Invalid input     | The schema errors                                                   | Yes   |
| Tool error        | The tool's message, or what it threw                                | Yes   |
| Result off schema | A refusal with the tool's name                                      | Yes   |

A direct tool can return images beside its typed result, and the model then receives content blocks
in place of structured content: the typed result as JSON in one text block, then one image block for
each image. The result record holds the typed result alone, so an image's bytes never reach the log.
Claude Code also saves each image to a file in the session's config directory, which a
[forget](../core/erasable-fields.md#forgetting-a-record) removes with the rest of the session state.

A tool that queues can declare `resolveDeadline`, which the endpoint calls when the call arrives to
read the time after which the effect must not start. An error from it ends the call with the Invalid
input outcome, with that error as the message. The deadline joins the action hash and the call
record, and [actions](../core/actions.md#deadlines) covers what it does.

A [connector](../../glossary.md#connectors-and-sandboxes) declares how an unknown outcome of its
actions is settled: a retry under the same idempotency key, a check with the provider, or nothing,
which sends the outcome to the user. The test build's 3 send tools, `test.send`, `test.send_keyed`
and `test.send_checked`, declare one each, so the crash tests cover every path.
[Actions](../core/actions.md#reconciling-an-unknown-outcome) covers the paths.

An action that failed or went unknown never counts as a tool error: the call was allowed and the
action ran, so the model reads its outcome as a result.

## Records

The call record holds a random call ID, the tool run's ID, the model's tool-use ID and the tool,
with the input in its [erasable fields](../core/erasable-fields.md). The guest sends the tool-use ID
with every call, in the MCP `_meta` key that its
[harness record](../core/model-profiles.md#harnesses) names, so a call's record joins to the model's
turn. A call from a guest whose harness names no key holds no tool-use ID. The result record holds
the outcome, the action ID for a queued call, and the source of content of each result field, with
the result or the message in its erasable fields. Both records sit on the tool run's
[thread](../core/event-log.md#what-a-record-holds) and carry one
[snapshot hash](../core/definitions.md#the-snapshot-hash), taken once per call, so a replay reads
the decision under the definitions that were in force for the call. The call record's plain payload
holds the model ID and the profile's ID that the tool run started with, because the call is model
output ([model profiles](../core/model-profiles.md#records-of-model-output)). The result record's
parent is the call record.

The result record's source of content is the least trusted source among its fields, with `untrusted`
the least trusted, then `owner_data`, then `owner`. A message that repeats text the model chose
counts as untrusted: the schema errors, and a registry or scope denial with the tool's name. A
tool's error and an action's failure count as untrusted too, because they can quote what an outside
service said. nixie's other messages, such as a rule's deny sentence, count as the user's own data.

Each record's erasable fields sit under that record's own key, and a forget destroys a key to make
what it guards unreadable. Some text in a call is guarded by the key of another record, such as a
memory item's text. When a tool's input or result repeats such text, a copy in the call's records
would stay readable after a forget destroyed the other record's key. Such a tool therefore gives
each of its records a form of its own, which leaves that text out. The model reads the whole result
either way. The memory tools use these forms, and
[the memory store](../memory/store.md#the-models-tools) covers what each one records.

The call record of a tool with such a form also keeps the arguments that the decision read, under
the call record's own key, so a replay decides on them and an action proposal hashes them whole.

The erasable fields of a result record hold the `result` or the `message`. They also hold a tool's
`hidden` object when the tool sets one with at least one property: values the server records and the
model never reads. `hidden` sits beside the `result`, or beside the `message` of an error the tool
returns, and nowhere else. The model reads back the `result` or the `message` alone, through the
reply, [`log.read`](../memory/context.md#reading-the-log) and `moment.read`. A forget erases
`hidden` with the record's other fields. The [search](./search.md#what-the-result-carries) tool
records each search's cost there. The [moment tools](../memory/moments.md#the-tools),
`memory.recall`, `memory.pending` and the `proposed` result of the 4 memory write tools,
`memory.remember`, `memory.edit`, `memory.retire` and `memory.pin`, record the UUID behind each
short ID of their result there, under `hidden.uuids`, so the stored result shows short IDs only.
