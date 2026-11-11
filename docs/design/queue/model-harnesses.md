# Model harnesses: the record, the capabilities and the tool-call wait

This doc covers the host side of the harness boundary: what nixie's host code holds of a harness,
and what it sends one. A harness is the model loop that runs a profile's turns inside a sandbox,
such as the Agent SDK or Codex. The boundary exists so that a task runs on a second harness with no
change to the code that runs its steps. The tool-call wait is in this doc because it is one field of
the harness record that reaches the model runtime through the turn frame.

The shapes and the exact error texts are in the sketch files under `sketches/harnesses/`, and this
doc holds the rules. Terms that this doc does not define are in the [glossary](../../glossary.md).
An item marked `(open: <name>)` is not settled: see [the open list](open/harnesses.md).

Related docs:

- [Turn outcomes and harness sessions](harness-sessions.md): how a turn ends, and a step on a
  harness with no session.
- [The Codex harness](codex-harness.md): the second harness and its guest.
- [Tasks on OpenRouter models](openrouter-tasks.md): a profile outside Claude on the Agent SDK
  harness.
- [The turn-input log](turn-input-log.md): the exact input of a model request.
- [Port rules](port-rules.md): the rules for any port.

## Terms

- **Harness.** The model loop that runs a profile's turns inside a sandbox.
- **Guest.** The program that runs a harness's loop inside the sandbox. The Agent SDK's guest is the
  package `conversation`, and the code calls it the conversation guest. It reads host frames on
  standard input and writes guest frames on standard output.
- **Model runtime.** The program a guest drives: the Agent SDK's CLI, or `codex app-server`.
- **Capability.** One thing a harness can do, such as `resume` or `turn-limit`. Each harness
  declares a fixed set.
- **Harness record.** The value host code holds for one harness bound to one profile. Its type is
  `Harness`.
- **Harness definition.** The one file of a harness in the models module. It owns the harness's
  profile type, its profile schema and the function that builds the harness record.
- **Tool-call wait.** How long a model runtime waits for one tool call's result before it drops the
  call.

## Built

This section states what the code does. Each section after it states the design.

- `harnessIDs` holds `agent-sdk` and `codex`. `harnessCapabilities` gives `agent-sdk` all 12
  capabilities and `codex` 6. Shape: [the IDs and capabilities](sketches/harnesses/02-types.ts),
  section A.
- The host frames are `turn`, `message`, `interrupt`, `summarize` and `purge`. The guest frames are
  `assistant`, `read`, `call`, `ended`, `summarized`, `failed` and `purged`.
- `HarnessDescriptor` holds `id`, `api`, `buildGrant`, `toTurnProfile`, `guest`, `imageKey` as a
  plain string, `toolUseMetaKey` and `listSessionFiles`. `getHarness` holds one record, for
  `agent-sdk`.
- `roleNeeds` and `checkHarnessFit` check each role's needs against the harness of the role's
  profile, at the config's load and at a task's start. The `task` and `worker` roles need `tools`,
  `fresh-session`, `interrupt`, `turn-limit` and `call-usage`. The `checker` role needs
  `structured-output`. The `conversation` role needs 9 capabilities.
- Host code reads the record and never branches on a harness ID. The `zgeoff/import-zones` lint rule
  confines the Agent SDK to the conversation guest, the contract suite and 2 eval files.
- A task's step runs the conversation's turn code, `runLiveTurn`. The step resumes at the stored
  session point, passes live messages and compacts with a `summarize` frame, even on a harness that
  declares no `resume`, `live-messages` or `summarize`.
- `ModelProfile` is one type that holds the Agent SDK's fields `authHeader`, `cacheTTL`,
  `contextTokens`, `effort` and `providerPin`. The turn profile union holds one member. The profile
  schemas sit in one tuple in the models config schema.
- `encodeTurnFrame` takes host frames and guest frames. The host calls it in `runGuestTurn`,
  `runGuestPurge` and the compaction module's `runGuestSummary`.
- The turn frame's `limits` holds `modelCalls`. The conversation guest sets no tool-call timeout.
- 3 host errors name "the conversation guest", for the guest of any harness.
- `deriveModelSecret` takes the resolved profile and reads its `authHeader`.
- The skill catalog's loader takes a profile and reads `contextTokens` and `getCLIContextWindow`.
  Only the conversation builds a skill catalog.
- The models module depends on the sandbox module, so the record's `imageKey` and `sizeRows` can
  have types of the sandbox module.
- The server image holds the digest of each guest image, so a host runs only the guest of its own
  release.

## The harness record

Host code holds one `Harness` per profile. Shape:
[the harness record](sketches/harnesses/02-types.ts), section E. Usage:
[how host code reads a harness](sketches/harnesses/01-usage.ts), section C.

- `bindHarness(profile)` returns the record. Host code reads the record and never a field that only
  one harness has.
- The record holds each value that differs by harness. `secretHeader` is the HTTP header that
  carries the model secret. `toTurnProfile` builds the profile that a turn frame and a check request
  carry. `contextWindow` is the window that the skill catalog's loader sizes the catalog by.
- `toTurnProfile` takes `kept` or `one-off`. `kept` is for a session that nixie resumes. `one-off`
  is for a session that nixie never resumes, such as a check's.
- The record's `session` holds the 3 functions that read a session point of the harness. It is
  non-null exactly when the harness declares both `resume` and `resume-at-entry`. nixie checks this
  when the models module loads. (open: defineHarness signature)
- `deriveModelSecret` takes the record and reads `secretHeader`. nixie names a model secret by a
  digest of 3 parts: the profile ID, the header and the host name of the model API. The built code
  uses the same 3 parts, so a secret has the name that the built code gives it.
- `imageKey` is the key of the harness's image, and `sizeRows` holds the name of one size-table row
  for the conversation and one for a system task. The record holds a row's name and never a figure.
  [Sandbox images](sandbox-images.md) owns the image keys, and [sandbox sizes](sandbox-sizes.md)
  owns the size rows.
- nixie sizes a worker's sandbox by the `systemTask` row of the worker's harness.
- `sizeRows.conversation` is null for a harness that serves no conversation.

## One definition per harness

Each harness has one definition file in the models module. (open: boundary design) Shape:
[the definition and the list](sketches/harnesses/02-types.ts), sections F and G.

- A definition owns its profile type, its strict profile schema and `bind`, which builds the record
  from a profile. Only that file's `bind` reads a field that only its harness has.
- `harnesses` lists every definition. `buildModelsConfigSchema` builds the profile union from the
  list.
- When a profile's `harness` is outside the list, nixie refuses the config at its load and names the
  list's IDs.
- When a profile holds a key that its harness's loop ignores, nixie refuses the config at its load.
- A definition file is in the models module, and never under `adapters/`. A harness reaches the
  model API from a guest, and never from the server. (open: definition home)
- A third harness is one definition file and one guest. It changes no reader of a profile or of a
  record.
- Two lists hold the harness IDs: `harnessIDs` in the wire library and `harnesses` in the models
  module. (open: harness ID lists test)

## The profile every reader takes

`ModelProfile` holds the 6 fields that every harness has: `id`, `harness`, `baseURL`, `credential`,
`model` and `prices`. Shape: [the profile](sketches/harnesses/02-types.ts), section E.

- Every harness gives the 6 fields the same meaning, so nixie prices a call and writes a record with
  no branch on a harness.
- `AgentSDKProfile` and `CodexProfile` extend `ModelProfile`, each in its harness's definition file.
- The turn profile union holds one member per harness. The check request's `profile` is the same
  union. Shape: [the turn profile union](sketches/harnesses/02-types.ts), section C.

## What the host sends a harness

The host sends a harness only the frames and the frame fields that its capabilities cover. Shape:
[the frame needs and the encoder](sketches/harnesses/02-types.ts), section D.

- `encodeHostFrame` is the host's only encoder. The turn, the live messages, the interrupt, the
  purge and the compaction's `summarize` all pass through it.
- `hostFrameNeeds` maps each host frame to the capability that it needs. A `message` frame needs
  `live-messages`, an `interrupt` frame needs `interrupt`, and a `summarize` frame needs
  `summarize`. A `turn` frame and a `purge` frame need none.
- `turnFieldNeeds` maps each of 2 turn fields to the capability that it needs. The `resume` key
  needs `resume`, and a non-null `limits.modelCalls` needs `turn-limit`.
- When the host is about to send a frame or a field that the harness does not declare,
  `encodeHostFrame` throws, nixie sends nothing, and the step fails. The step code asks for no such
  frame, so the throw marks a bug. (open: host error texts)
- `encodeTurnFrame` takes guest frames only.
- A host error about a guest never names the guest of another harness. (open: host error texts)

## The contract a guest meets

Each guest meets one contract, whatever its model runtime.

| Need                   | What the guest does                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Turn start             | Reads one `turn` frame and writes guest frames                                         |
| Tool calls             | Connects to the frame's tool route over HTTP MCP with the step token                   |
| Tool-use ID            | Sends the model's tool-use ID under the record's `toolUseMetaKey` on each tool call    |
| Streaming              | Sends one `assistant` frame per model message, as each completes                       |
| Usage                  | Sends one `call` frame per model API call, before the next frame                       |
| Reads                  | Sends a `read` frame that lists the input messages the model received                  |
| Model-call limit       | Stops at `limits.modelCalls` and ends with the outcome `limit`                         |
| Interrupt              | Stops the model loop on an `interrupt` frame and sends `ended` for the turn so far     |
| Failure                | Sends `failed` with a reason, and never `ended` after it                               |
| Purge                  | Removes every file the loop holds of a session on a `purge` frame, then sends `purged` |
| A tool call of minutes | Sets `limits.toolCallWaitMs` in the model runtime, when it is a number                 |

- The turn frame holds the profile, the tool route, the system prompt, the input messages and the
  limits.
- When the tool server is not connected, the guest fails the turn.
- A `call` frame holds its usage in `modelCallUsageSchema`. The host prices it with the profile's
  price table. `ended.usage` is the sum of the turn.
- The read cursor moves only over the messages that a `read` frame lists.
- The guest sends `failed` when the model API refuses, the loop errors or its stream closes.
- When you forget a memory item, the session cleanup starts the guest of each open task that reads
  memory, and sends it a `purge` frame.
- A guest resumes, takes live messages and compacts only when its harness declares the capability.
- Each step starts the guest, runs one turn and ends the guest.
- The design has 2 statements on a model-call limit stop: it ends as an interrupted turn does, and
  it ends with `limit`. This doc follows `limit`. (open: limit stop outcome)

## The tool-call wait

A model runtime has a timeout of its own for one tool call, and drops a call whose result arrives
after it. A `worker.run` call blocks for minutes. So each harness declares how long its runtime
waits, the host sends that figure with each turn, and the guest sets it in the runtime. Shape:
`toolCallWaitMs` on [the harness record](sketches/harnesses/02-types.ts), section E, and
`limits.toolCallWaitMs` in section C.

- The record's `toolCallWaitMs` is in milliseconds. It is 900,000, which is 15 minutes, on each
  harness whose runtime obeys a setting for the wait.
- Each harness has a probe: a test that sets the timeout to 2 seconds and shows that the runtime
  obeys it.
- The value is null on a harness whose runtime has no such setting, and on a harness whose probe has
  not passed. (open: agent-sdk tool-call timeout) (open: codex tool-call timeout)
- The host copies the record's value into the turn frame as `limits.toolCallWaitMs`. A guest holds
  no wait of its own, so the figure that the config's load checks is the figure the runtime gets.
- The guest passes the wait to its runtime when it starts the turn. The Agent SDK guest sets it in
  the CLI's setting for the timeout of one MCP tool call. The Codex guest sets it in the config that
  it writes for nixie's MCP server.
- The wait covers every tool call of the turn.
- `worker.run` needs a non-null `toolCallWaitMs` on the harness of its caller. (open: wait
  milestone)
- The figure is a constant and never a function of the config. [Task workers](task-workers.md) owns
  the config rule that compares a worker's time limit with the wait, and the rule that refuses the
  `worker` role when the harness of a caller has a null wait. A wait worked out from the worker's
  limit would make the time-limit rule pass for every limit.
- With a wait of 15 minutes, the time-limit rule passes a worker time limit of up to 14.5 minutes.
- Each tool of nixie has its own time limit on the host, so a long wait in the runtime gives no tool
  more time.
- The wait is a value on the turn frame and has no state. When a step runs again, its turn frame
  carries the wait again.

| Case                                                      | What happens                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| A tool returns inside the wait                            | The model gets the tool result                                     |
| The runtime ignores the setting, and its own timeout ends | The runtime drops the call and tells the model so in its own words |
| nixie stops while a call waits                            | The step's lease lapses, and the step runs again                   |

The probes exist to show that a runtime never ignores the setting.

- After a runtime drops a call, the host's tool call runs on to its own limit.
- nixie writes that call's result record when the call ends, and nothing reads the result.

## Not in scope

- A wait per tool, and a wait worked out from `models.limits.workerRun.minutes`.
- The config rules on a worker's time limit, and what a rerun does with an open worker run.
  [Task workers](task-workers.md) owns both.
- The image keys, the size rows and their figures. [Sandbox images](sandbox-images.md) and
  [sandbox sizes](sandbox-sizes.md) own them.
- A capability for a process that a harness holds across steps. Voice needs one process for a whole
  call, and this design does not meet that need.
- A turn field that removes images for a harness without `images`.
- A fixed context window for the skill catalog when a harness reports none.
- A per-harness `ended` frame.
