# Tool calls

A model loop reaches nixie's tools through a tool endpoint that serves the Model Context Protocol
(MCP), one endpoint per task run or worker run, under [0003](../../decisions/0003-sdk-placement.md).
The model loop runs inside a sandbox, and the tools run on the host, so the endpoint is the one
place where what the model asks for meets what nixie lets happen. Every call passes the run's tool
list, the tool's input schema and the [decision point](../policy/decision-point.md) before it runs,
and nixie records the call, its decision and its result in the [event log](../core/event-log.md).
`modules/tools` owns the endpoint and the tool registry. [Sandboxes](./sandboxes.md) covers the
route a guest's connection takes to reach the endpoint, and [actions](../core/actions.md) covers
what happens to a call that acts outside nixie.

## One endpoint per run

Each run gets an MCP server of its own, listening on a Unix socket of its own, with a bearer token.
The socket a connection arrives on decides its run, and the token is a second check. The sandbox
adapter relays every guest connection to the socket of the run that owns the sandbox, so a guest
never picks its run, whatever it claims. A request with any other token, another run's included,
gets a 401. Stopping a run revokes its token, closes every open stream and removes the socket, and a
run started again under the same ID gets a fresh token.

The endpoint builds a low-level MCP server for each request, never the high-level one. The
high-level server answers a call to a tool it does not list by itself, and such a call must still
reach the decision point, so that its scope stage denies it and the denial is recorded. The endpoint
passes each chunk of a response stream to the guest as the server writes it, because Claude Code
waits for the listen stream's acknowledgement before it lists tools, and a buffering relay would
delay every run start. The socket has no idle timeout, because a listen stream stays open for the
whole run.

## A tool definition

A tool definition holds the name, the description, the input and output JSON Schemas, the effect
declaration, how the tool runs, and its code. The registry refuses a definition that breaks one of
its rules:

- A name appears once.
- The input schema and the output schema both describe objects.
- Every top-level field of the output has a source of content in the declaration, and every declared
  source names a field.
- A tool whose effects reach outside nixie, such as a write, a send or a spend, runs queued as an
  action, and every other tool runs direct. A read retried after a crash repeats nothing, so it can
  run inside the turn.

The tool list shows the model each listed tool's name, description and input schema, and nothing
else. The output schema and the declaration stay in the registry, because Claude Code shows the
model only those three fields, as the
[tools endpoint spike](../../design/platform/spikes/tools-endpoint/README.md) found.

## The call steps

Each call runs through five stages in order:

1. The endpoint checks the input of a listed tool against its input schema. An input that breaks the
   schema never reaches the decision point.
2. It asks the decision point, with the run's tool list.
3. It records the call with its decision, before the tool runs.
4. It runs an allowed direct tool, or passes an allowed queued call to the action queue and waits a
   bounded time for its outcome.
5. It checks a typed result against the output schema, and records the result.

A tool missing from the run's list skips the schema check, and the registry or scope stage denies
it, so the model receives the denied outcome. The schema errors of an unlisted tool would otherwise
show the model that the tool exists and what it takes. The action queue is an interface that the
tools module declares and its caller passes in, so tools never imports actions.

A typed result reaches the model as structured content with no content blocks, and every other
outcome as one text block:

| Outcome           | What the model receives                   | Error |
| ----------------- | ----------------------------------------- | ----- |
| Allowed, direct   | The tool's typed result                   | No    |
| Allowed, queued   | The action's typed result once it is done | No    |
| Queued, not done  | The action ID, once the wait runs out     | No    |
| Queued, failed    | The action ID and its reason              | No    |
| Denied            | The decision point's sentence             | Yes   |
| Invalid input     | The schema errors                         | Yes   |
| Tool error        | The tool's message, or what it threw      | Yes   |
| Result off schema | A refusal with the tool's name            | Yes   |

An action that failed or went unknown is no tool error: the call was allowed and the action ran, so
the model reads its outcome as a result.

## Records

The call record holds a random call ID, the run, the model's tool-use ID and the tool, with the
input in its erasable fields. Claude Code sends the tool-use ID with every call, so a call's record
joins to the model's turn. The result record holds the outcome, the action ID for a queued call, and
the source of content of each result field, with the result or the message in its erasable fields.
Both records sit on the run's thread and carry one snapshot hash, taken once per call, so a replay
reads the decision under the definitions it ran under. The result record's parent is the call
record.

The result record's source of content is the least trusted source among its fields. A message that
repeats text the model chose counts as untrusted: the schema errors, and a registry or scope denial
with the tool's name. A tool's error and an action's failure count as untrusted too, because they
can quote what an outside service said. nixie's other messages, such as a rule's deny sentence,
count as the user's own data.
