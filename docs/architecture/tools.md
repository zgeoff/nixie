# The tool endpoint

`modules/tools` serves nixie's tools to a model loop over MCP, one endpoint per task run or worker
run. Each run gets a stateless MCP server on a Unix socket of its own, with a bearer token. The
endpoint lists only the tools on the run's tool list, and every call passes the input schema and the
[decision point](decision-point.md) before it runs. nixie writes the call, the decision and the
result to the [event log](event-log.md).

## A tool definition

A tool definition holds the name, the description, the input and output JSON Schemas, the effect
declaration, how the tool runs, and its code. The registry refuses a definition that breaks one of
these rules:

- A name appears once.
- The input schema and the output schema both describe objects.
- Every top-level output field has a source of content in the declaration.
- A tool whose effects reach outside nixie, such as a write, a send or a spend, runs queued as an
  [action](actions.md), and every other tool runs direct. **Why:** a read retried after a crash
  repeats nothing.

## What the model sees

The tool list shows each listed tool's name, description and input schema, and nothing else. The
output schema and the declaration stay in the registry. **Why:** Claude Code shows the model only
those 3 fields, as the [tools endpoint spike](../design/platform/spikes/tools-endpoint/README.md)
found.

A typed result goes back as structured content with no content blocks, and every other outcome as
one text block:

| Outcome            | Result                                    | Error |
| ------------------ | ----------------------------------------- | ----- |
| Allowed, direct    | The tool's typed result                   | No    |
| Allowed, queued    | The action's typed result once it is done | No    |
| Queued, not done   | The action ID, once the wait runs out     | No    |
| Queued, failed     | The action ID and its reason              | No    |
| Denied             | The decision point's sentence             | Yes   |
| Invalid input      | The schema errors                         | Yes   |
| Tool error         | The tool's message, or what it threw      | Yes   |
| Outside the schema | A refusal with the tool's name            | Yes   |

An input that breaks the schema never reaches the decision point. A tool missing from the run's tool
list skips the schema check, and the registry or scope stage denies it. **Why:** the schema errors
of an unlisted tool would show the model that the tool exists and what it takes.

## The call steps

Each call runs in order:

1. The endpoint checks the input of a listed tool against the input schema.
2. It asks the decision point, with the run's tool list.
3. It records the call with the decision, before the tool runs.
4. It runs an allowed direct tool, or passes an allowed queued call to the action queue and waits
   for its outcome. The action queue is an interface that the actions module implements, so tools
   never imports actions.
5. It checks a typed result against the output schema and records the result.

### Records

The call record holds the call, the run, the model's tool-use ID and the tool, with the input as
erasable fields. The result record holds the outcome, the action ID for a queued call, and the
source of content of each result field, with the result or the message as erasable fields. Both
records carry the run's thread and one snapshot hash, and the result's parent is the call. The
tool-use ID comes from the model's call, so a record joins to the model's turn.

The result record's source of content is the least trusted of its fields. A message that repeats
text the model chose counts as untrusted: the schema errors, and a registry or scope denial with the
tool's name. A tool's error and an action's failure count as untrusted too. nixie's other messages
count as your data.

## One endpoint per run

The socket a connection arrives on decides its run, and the bearer token is a second check:

- The tool endpoint resolves a sandbox's owner, which is its run, to that run's socket. The sandbox
  adapter relays each guest connection there, so a guest never picks its run.
- A request with another token, another run's token included, gets a 401.
- Stopping a run revokes its token, closes every open stream and removes the socket. A run started
  again under the same ID gets a new token.

Each request builds a low-level MCP server for the run. **Why:** the high-level server answers a
call to a tool it does not list itself, and the scope stage must still deny such a call.

The endpoint passes each chunk of a stream to the guest as the server writes it. **Why:** Claude
Code waits for the listen acknowledgement before it lists tools, so a buffering relay delays every
run start. The socket has no idle timeout, because a listen stream stays open for the whole run.
