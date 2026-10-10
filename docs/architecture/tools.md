# The tool endpoint

`modules/tools` serves nixie's tools to a model loop over MCP, one endpoint per task run or worker
run. `startToolEndpoint` starts it, and `startRun` gives each run a stateless Streamable HTTP MCP
server on a Unix socket of its own, with a bearer token. The endpoint lists only the tools on the
run's tool list, and every call passes the input schema and the [decision point](decision-point.md)
before it runs. nixie writes the call, the decision and the result to the [event log](event-log.md).

## A tool definition

A `ToolDefinition` holds the name, the description, the input and output JSON Schemas, the effect
declaration, the execution and `run`. [`types.ts`](../../modules/tools/src/types.ts) holds it.
`buildToolRegistry` compiles the schemas and refuses a definition that breaks one of these rules:

- A name appears once.
- The input schema is an object.
- A tool runs `queued` when its effects include `write`, `delete`, `send`, `spend` or `device`, and
  `direct` otherwise. **Why:** a read retried after a crash repeats nothing.
- The output is an object, and every top-level field has a source of content in the declaration.

## What the model sees

`tools/list` returns each listed tool's name, description and input schema, and nothing else. The
output schema and the declaration stay in the registry. **Why:** Claude Code shows the model only
those 3 fields, as the [tools endpoint spike](../design/platform/spikes/tools-endpoint/README.md)
found.

A typed result goes back as `structuredContent` with no content blocks, and every other outcome as
one text block:

| Outcome            | Result                                       | `isError` |
| ------------------ | -------------------------------------------- | --------- |
| Allowed, direct    | The tool's typed result                      | No        |
| Allowed, queued    | The action's typed result once it is done    | No        |
| Queued, not done   | `queued as <id>` after 10 s                  | No        |
| Queued, failed     | `action <id> failed: <reason>`               | No        |
| Denied             | `denied: ` and the decision point's sentence | Yes       |
| Invalid input      | The schema errors                            | Yes       |
| Tool error         | The tool's message, or what it threw         | Yes       |
| Outside the schema | A refusal that names the tool                | Yes       |

An input that breaks the schema never reaches the decision point. A tool missing from the run's tool
list skips the schema check, and the registry or scope stage denies it. **Why:** the schema errors
of an unlisted tool would show the model that the tool exists and what it takes.

## The call steps

`runToolCall` runs each call in order:

1. It checks the input of a listed tool against the input schema.
2. It asks the decision point, with the run's tool list.
3. It writes the `tool_called` record with the decision, before the tool runs.
4. It runs an allowed `direct` tool, or hands an allowed `queued` call to the `ActionQueue` under a
   new action ID and waits for its outcome.
5. It checks a typed result against the output schema and writes the `tool_result` record.

The `ActionQueue` is an interface that the actions module implements. The endpoint passes it the
action ID, the call, the run and the sequence of the call's record.

### Records

| Record        | Payload                                                   | Erasable                  |
| ------------- | --------------------------------------------------------- | ------------------------- |
| `tool_called` | Call ID, run ID, tool-use ID, tool                        | The input                 |
| `tool_result` | Call ID, run ID, tool-use ID, outcome, action ID, sources | The result or the message |

Both records carry the run's thread and one snapshot hash, and the result's parent is the call's
sequence. `sources` maps each result field to its source of content, and the envelope's source is
the least trusted of them. A message that repeats text the model chose counts as `untrusted`: schema
errors, and a registry or scope denial with the tool's name. A tool's error and an action's failure
count as `untrusted` too. nixie's other messages count as `owner_data`. The tool-use ID comes from
`claudecode/toolUseId` in the call's `_meta`, so the record joins the call to the model's turn.

## One endpoint per run

The socket a connection arrives on decides its run, and the bearer token is a second check:

- `getToolTarget` is the `ToolTargetResolver` the sandbox adapter takes. It maps a sandbox's owner,
  which is its run's ID, to that run's socket. The adapter relays each guest connection there, so a
  guest never picks its run.
- Each run's token is 32 random bytes. A request with another token, another run's token included,
  gets `401`.
- `stop` on a run revokes the token, closes every open stream, stops the listener and removes the
  socket. A run started again under the same ID gets a new token.

Each request builds a low-level MCP `Server` for the run. **Why:** `McpServer` answers a call to a
tool it does not list itself, and the scope stage must still deny such a call.

The endpoint returns the MCP handler's response unread, so each chunk of a stream reaches the guest
as the server writes it. Claude Code waits for the `subscriptions/listen` acknowledgement before it
lists tools, and a buffering relay delays every run start. The run's server sets the socket's idle
timeout to none, because a listen stream stays open for the run and Bun closes an idle connection
after 10 s by default.
