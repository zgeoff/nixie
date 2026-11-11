# The Codex harness and its guest

This doc covers the Codex harness: a model profile on `harness: codex`, the harness's definition,
and the guest that drives the Codex CLI. With the harness, the agent starts a task on an OpenAI
model: it calls `task.start` with a model name that `models.selectable` lists. The task runs through
`codex app-server` in its own sandbox, on an API key that the sandbox backend's broker holds. It has
the persona, the memory, the tool subset, the limits and the report of any other task.

The shapes are in the sketch files under `sketches/harnesses/`, and this doc holds the rules. Terms
that this doc does not define are in [model harnesses](model-harnesses.md#terms) and the
[glossary](../../glossary.md). An item marked `(open: <name>)` is not settled: see
[the open list](open/harnesses.md). Where a sentence carries such a mark, the sentence states the
intended design.

Related docs:

- [Model harnesses](model-harnesses.md): the harness record and the contract that a guest meets.
- [Turn outcomes and harness sessions](harness-sessions.md): the turn outcome, and a step on a
  harness with no session.

## Built

This section states what the code does. Each section after it states the design.

- `harnessIDs` holds `codex`, and `harnessCapabilities` gives it 6 capabilities: `tools`,
  `fresh-session`, `interrupt`, `images`, `turn-limit` and `call-usage`. The models module holds a
  harness record for `agent-sdk` only.
- The wire library's `ModelAPI` type has the value `openai-responses`, and the counting proxy counts
  the usage of that API.
- `parseOpenAICallUsage` in the counting proxy prices a cache write with no lifetime at the price of
  the 1-hour lifetime.
- The sandbox manifest's strict schema holds the image keys `conversation` and `fetch`.
- `roleNeeds` lists the capabilities that each model role needs. The 6 capabilities of `codex` cover
  the roles `task`, `worker`, `memory-writer` and `memory-consolidator`. They cover neither the
  `conversation` role nor the `checker` role.
- The spike `codex-app-server` under `research/` holds a script that drives `codex app-server`, and
  its results: the app-server methods, the 2 conditions that mark one model call, and the
  `_meta.callId` key.

## A profile on the Codex harness

An example profile is in [the usage sketch](sketches/harnesses/01-usage.ts), section A. The type of
its keys is in [the types sketch](sketches/harnesses/02-types.ts), section J.

- A `codex` profile is a strict object of 6 keys: `harness`, `base_url`, `credential`, `model`,
  `effort` and `prices`.
- When a `codex` profile holds `auth_header`, `cache_ttl`, `context_tokens`, `provider_pin` or
  `outside_claude`, nixie refuses the config at its load.
- `effort` is one of the effort values of the pinned Codex CLI. The command
  `codex app-server generate-ts` prints the CLI's protocol types, and the repo holds a copy of them
  beside the profile schema. (open: codex effort values) (open: codex effort pin)
- The price keys are the keys of `modelPricesSchema`. You confirm each price on the provider's
  pricing page.
- The agent starts a task on the profile as on any selectable model.
- A `codex` profile's requests pass the counting proxy only when its `base_url` is the URL of a
  proxy route, as for any profile.

Which model roles a `codex` profile serves:

| Role           | Served | Why                                                          |
| -------------- | ------ | ------------------------------------------------------------ |
| `task`         | Yes    | Codex declares every capability that the role needs          |
| `worker`       | Yes    | Codex declares every capability that the role needs          |
| `conversation` | No     | nixie refuses the config and lists each missing capability   |
| `checker`      | No     | nixie refuses the config: the role needs `structured-output` |

[Decision 0050](../../decisions/0050-no-built-in-memory-tasks.md) deletes the 2 memory roles of the
built code. The Codex harness lands after that delete, so the table has no row for them. (open:
codex memory roles)

## The Codex definition

The definition is one file in the models module. Its values are in
[the types sketch](sketches/harnesses/02-types.ts), section G.

- Codex declares the 6 capabilities that `harnessCapabilities` holds. It declares no `resume`,
  `live-messages` or `summarize`. The spike shows that the CLI supports them, and a task needs none
  of the 3.
- Its `session` is null: Codex has no session that nixie resumes. Each step starts a Codex thread of
  its own, with a system prompt and input that nixie builds from the event log. (open: session field
  name)
- Its `contextWindow` is null, because Codex declares no `context-window`.
- Its grant puts the broker's placeholder in `OPENAI_API_KEY`. The model credential never enters the
  guest.
- Its `secretHeader` is the HTTP header that the model API reads the key from. Which header that is
  waits for a check. (open: codex secret header)
- Its image key is `codex`, and its `systemTask` size row is `codexTask`.
  [Sandbox images](sandbox-images.md) owns the key. [Sandbox sizes](sandbox-sizes.md) owns the row,
  its figure and the check that measures it.
- Its guest package is `codex`, with a `turn` entry and no `check` entry.
- Its `toolUseMetaKey` is `callId`.
- Its `toolCallWaitMs` follows [the tool-call wait](model-harnesses.md#the-tool-call-wait). (open:
  codex tool-call timeout)

## The Codex guest

The guest is the package `codex` under `guests/`. It imports no Agent SDK and no client library. One
turn as commented code is in [the flow sketch](sketches/harnesses/03-flow.ts), section D.

- The guest drives `codex app-server` over stdio JSON-RPC. It never uses `codex exec --json`, which
  reports no usage per model call.
- The sandbox image pins one Codex CLI version, and the guest refuses to run any other version.
- The guest meets [the contract a guest meets](model-harnesses.md#the-contract-a-guest-meets).

What the guest does for each frame that the host sends:

| Host frame  | What the guest does                                                                  |
| ----------- | ------------------------------------------------------------------------------------ |
| `turn`      | Sends `thread/start` with the system prompt as `baseInstructions`, then `turn/start` |
| `interrupt` | Sends `turn/interrupt` with the thread ID and the turn ID                            |
| `purge`     | Removes the session state in the Codex home folder, then sends `purged`              |

What the guest sends the host for each Codex notification:

| Codex notification                                            | Guest frame |
| ------------------------------------------------------------- | ----------- |
| `item/completed` whose item is an `agentMessage`              | `assistant` |
| `thread/tokenUsage/updated` for one model call                | `call`      |
| `turn/completed` with the status `completed` or `interrupted` | `ended`     |
| `turn/completed` with the status `failed`                     | `failed`    |
| An error notification, or a closed stream                     | `failed`    |

- `thread/start` also holds the profile's `model` and the working directory as `cwd`.
- A `thread/tokenUsage/updated` notification stands for one model call when 2 conditions hold. The
  notification's turn is the turn that this guest process started. The notification's `total` equals
  the `total` of the previous notification of the thread plus its own `last`.
- The guest counts its `call` frames. At `limits.modelCalls`, it sends `turn/interrupt`.
- The guest never sends `ended` after `failed`.
- After a `purge` frame, the Codex home folder holds no thread.
- A task on Codex that reads memory has memory text in the Codex home folder. So when you forget a
  memory item, nixie sends that task's guest a `purge` frame, as it does for any open task that
  reads memory.

The guest maps the usage of one model call by 3 rules:

- Uncached input is the input count less the cached count and less the cache write count.
- Cache read is the cached count.
- Cache write counts as a write of the 1-hour lifetime. Codex reports no lifetime, and the 1-hour
  price is the higher one. So the cost that nixie works out from the `call` frame and the profile's
  price table is never below the real cost.

## The config that the guest writes

The guest writes a Codex config, and then starts the CLI.

- The config holds a custom model provider on the profile's base URL, with
  `supports_websockets = false`.
- The config holds nixie's MCP server over HTTP, with the step token, `required = true` and every
  tool approved.
- The config holds `tool_output_token_limit` at the top level. Its value waits for a check that a
  full page of `memory.recall` reaches the model whole. (open: codex tool output limit)
- The config turns off Codex's own skills, agents and project docs, and each Codex feature that adds
  text to the model's input unasked. The config keys for this are not written down. (open: codex
  config keys)
- The guest runs the CLI in a working directory that holds an empty git repository of its own, with
  no remote.

## The release gates

A deployment lists a `codex` profile in `models.selectable` only after each gate passes. The builder
of the harness runs each gate once, by hand, for the nixie release that holds the harness.
[The gates slice](slices/harnesses.md) holds the commands. nixie's code checks no gate: a config
that lists a `codex` profile loads with no gate passed. A gate never sends a turn to a production
deployment.

- The check that measures the `codexTask` size row passes. [Sandbox sizes](sandbox-sizes.md) owns
  it.
- The spike left 6 cases untested, such as a failed model call. The check of each case passes.
  (open: codex untested paths)
- The check of `tool_output_token_limit` passes at some value. This gate applies only to a
  deployment that gives a task `memory: read`. (open: codex tool output limit)
- One tool-using turn in a test imp passes, with the real CLI and a paid API key from you.
- One task on a preview deployment passes, with the same key.

## Other rules

- The checks that nixie makes at a task's start, the brief and the report are the same for a task on
  any harness.
- The memory tools reach a Codex task through the same tool endpoint as any task.
- When a pull request changes the pinned CLI version, its author reruns the spike's script. The CLI
  labels `app-server` experimental.

## Not in scope

- The ChatGPT plan login.
- Codex on the `conversation` role, the `checker` role or a memory role.
- Resume, live messages and compaction on Codex, and coding sessions.
- A refusal of `memory: read` for a task on a `codex` profile. If no value of
  `tool_output_token_limit` passes its check, that refusal is designed with the memory tools.
- The `codex` image key, the `codexTask` size row and the check that measures the row.
