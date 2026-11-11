# Harnesses: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The docs are
[model harnesses](../model-harnesses.md),
[turn outcomes and harness sessions](../harness-sessions.md),
[the Codex harness](../codex-harness.md), [tasks on OpenRouter models](../openrouter-tasks.md),
[the turn-input log](../turn-input-log.md) and [the turn-input store](../turn-input-store.md). The
slices are in [the harness slices](../slices/harnesses.md) and
[the turn-input log slices](../slices/harnesses-log.md).

The tracker issues: [the Codex harness issue](https://linear.app/zgeoff/issue/GEO-2237),
[the OpenRouter tasks issue](https://linear.app/zgeoff/issue/GEO-2234),
[the turn-input log issue](https://linear.app/zgeoff/issue/GEO-2355) and
[the worker tool issue](https://linear.app/zgeoff/issue/GEO-1793), which the tool-call wait gates.

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: wait milestone.
- Slice 2: agent-sdk tool-call timeout; wait milestone.
- Slice 3: boundary design; outcome values; definition home; codex effort pin; defineHarness
  signature; host error texts; limit stop outcome; session field name; in part: agent-sdk unkept.
- Slice 4: request change place; missing mark refusal; openrouter harness record; system blocks
  probe; provider order field; in part: long prompt probe.
- Slice 5: codex memory roles; codex effort values; codex secret header; codex config keys.
- Slice 6: codex tool-call timeout.
- Slice 7: codex tool output limit; codex untested paths.
- Slice 8: capture and store; base URL path probe; capture tag layout.
- Slice 9: forget and the log; retention limit; log default; log roles; secret in a request;
  turnInputs procedures; drop and reset cause; miss reason triggers; in part: rollback reads input
  records.
- Tasks slice 9: agent-sdk tool-call timeout.

## Not decided

Each waits for you. All of this family is milestone 4, and its choices are decided just before its
build.

- **boundary design.** Milestone 4. Blocks slice 3. The design of the harness boundary. The options:
  one definition per harness, bound to its profile, with one host encoder that checks capabilities;
  4 capability checks in the step code; a second table of what each session event needs. Intended:
  the definition per harness, which the docs state.
- **outcome values.** Milestone 4. Blocks slice 3. The values of a turn's outcome. The options:
  `finished`, `limit`, `interrupted` and `overflow`; the same 4 with `stopped` for a refusal or an
  output cap. Intended: the 5 with `stopped`.
- **codex memory roles.** Milestone 4. Blocks slice 5. Whether a `codex` profile may serve a memory
  role. The options: build the Codex harness after the delete of the 2 built-in memory tasks, so
  that no memory role exists that Codex fits; refuse both roles at the config's load until that
  delete lands; allow both, as the fit check does. Intended: build it after the delete.
- **definition home.** Milestone 4. Blocks slice 3. Where a harness's host-side definition lives.
  The options: the models module; `adapters/`; a folder rule of its own. Intended: the models
  module.
- **codex effort pin.** Milestone 4. Blocks slice 3. The harness boundary's pull request holds the
  `codex` member of the turn profile union, which needs the effort values of the pinned Codex CLI.
  The pin of the CLI arrives with the Codex guest, in a following pull request. The options: the
  boundary's pull request pins the CLI version and checks in the generated types; or the `codex`
  member and the Codex definition move to the guest's pull request. No intended option is stated.
- **request change place.** Milestone 4. Blocks slice 4. Where a request outside Claude is changed.
  The options: in the conversation guest by a match on the system prompt's tail; in the guest by an
  ordered list of edits; in the counting proxy with a mark on its route. Intended: the guest, by the
  tail match.
- **missing mark refusal.** Milestone 4. Blocks slice 4. Whether a profile with no `outside_claude`
  whose model ID does not contain `claude` may load. The options: refuse at load; allow. Intended:
  refuse.
- **openrouter harness record.** Milestone 4. Blocks slice 4. Which harness record the OpenRouter
  work builds against. The options: `toTurnProfile` on `HarnessDescriptor`, when it lands ahead of
  the boundary; the Agent SDK definition's `bind`, when it lands after. No order is stated, so the
  slice builds against the record that stands.
- **capture and store.** Milestone 4. Blocks slice 8. Where the turn-input log captures and stores.
  The options: a spool sealed to a key per step, with files outside the backup set; a post from the
  proxy to a sink that nixie serves; a plain spool with rows in the database. Intended: the sealed
  spool and files.
- **forget and the log.** Milestone 4. Blocks slice 9. What a forget does to the log. The options:
  `on_forget: threads`; `since_item`; `keep`. Intended: `threads`.
- **retention limit.** Milestone 4. Blocks slice 9. The options: 3 days; 7 days; 30 days; each with
  a byte bound. Intended: 7 days and a byte bound.
- **log default.** Milestone 4. Blocks slice 9. Whether the log runs by default. The options:
  always; off until you turn it on; on for a set time. Intended: off until turned on, for a set
  time.
- **log roles.** Milestone 4. Blocks slice 9. Which roles the log covers. The options:
  `conversation` and `task` only; add `worker`; add `checker`; every role. Intended: `conversation`
  and `task`.
- **secret in a request.** Milestone 4. Blocks slice 9. What the log does with a request whose text
  holds a secret. The options: accept and seal it; mask the secret ahead of the capture; drop the
  tool call from the logged body. For an own secret value: store no body and record a miss, or
  narrow the rule so that the log may hold it. Intended: accept and seal, and a miss for an own
  secret value.
- **production routing.** Milestone 4. Blocks no slice. Whether production sends its model calls
  through the counting proxy. The options: profiles pointed at the model endpoint; a route only for
  the profiles whose requests you want to log; a route for every profile. Intended: a route for
  every profile, after a soak on a preview. A profile with no route gets no logged request. The
  proxy fails closed, so a fault in it stops every turn on a route.
- **harness slice order.** Milestone 4. Blocks no slice. The dependency facts in
  [the slices](../slices/harnesses.md) are settled. The order between the 4 groups of slices (the
  tool-call wait, the boundary with Codex, OpenRouter, the turn-input log) has no stated reason,
  beyond those facts.

## Not checked

- **codex effort values.** Milestone 4. Blocks slice 5. The effort values of the pinned Codex CLI
  are not in the repo. Run `codex app-server generate-ts` on the pinned CLI. The output holds the
  values: check the protocol types in beside the schema, and `codexEffortSchema` takes them.
- **codex secret header.** Milestone 4. Blocks slice 5. Which header the model API takes for the key
  in `OPENAI_API_KEY`. Read the model API's docs, then run
  `bun run test:imp guests/codex/src/run-turn.imp.test.ts` in a test imp, where the broker swaps the
  placeholder. The turn passes with `bearer`: `secretHeader` is `'bearer'`. It passes only with
  `x-api-key`: `secretHeader` is `'x-api-key'`.
- **codex tool output limit.** Milestone 4. Blocks slice 7. The value of `tool_output_token_limit`.
  One case of `bun run test:imp guests/codex/src/run-turn.imp.test.ts`, by hand in a test imp:
  nixie's MCP server returns a result of the page limit of `memory.recall`, in bytes, that the
  memory recall design states for the Agent SDK harness. It passes at a value when the next request
  that the stand-in model API records holds the result's last 100 bytes: the guest sets that value.
  No value passes: the result goes to you with 2 ways on, a refusal of `memory: read` for a task on
  a `codex` profile, or a smaller page limit for this harness, as a value of the harness record that
  the recall tool reads for its caller. Until it passes, no deployment whose tasks may hold
  `memory: read` lists a `codex` profile as selectable.
- **codex untested paths.** Milestone 4. Blocks slice 7. The same file, one case each, by hand in a
  test imp: a failed model call, a retried one, automatic compaction inside one long turn, an MCP
  server that is down at `required = true`, Codex inside a sandbox behind the real proxy, and the
  error that marks a context overflow. Each passes: the harness may be selectable. Any line but the
  overflow fails: the harness is out of `models.selectable`. No overflow error is found: an overflow
  on Codex is a `failed` turn.
- **agent-sdk unkept.** Milestone 4. Blocks part of slice 3. Whether an Agent SDK task can have an
  opening and no stored point. Such a task reads as `fresh` in the built code and as `unkept` in the
  design. Search the step code, and add one case to
  `modules/sessions/src/pick-session-position.test.ts`. It cannot occur: drop the case. It can: the
  case pins that the opening records a rebuild with `reason: null`.
- **long prompt probe.** Milestone 4. Blocks part of slice 4. What the CLI does past 200,000 tokens
  for a model outside its catalogue. The slice creates
  `guests/conversation/src/sdk-contract/run-long-prompt-probe.agent-sdk.test.ts`; run it with
  `bun run test:agent-sdk`. Against the stub model, a turn whose prompt holds more than 200,000
  tokens reaches the stub and ends with `ended`: build the `context_tokens` rule, which checks the
  cap of such a model only against the range 100,000 to 1,000,000. The CLI refuses the call: build
  no rule, the cap is 200,000 or less, the model gets no window above that on this harness, and the
  result goes to you.
- **system blocks probe.** Milestone 4. Blocks slice 4. How the CLI lays out its system blocks. The
  slice creates `guests/conversation/src/sdk-contract/run-system-blocks-probe.agent-sdk.test.ts`;
  run it with `bun run test:agent-sdk`. It shows 4 facts: how the CLI splits a custom system prompt
  into blocks on a turn, a resumed turn and a summary; whether it sends a side call with a system
  prompt of its own; whether it reaches loopback with the sandbox's proxy variables set; and that a
  Claude profile's bytes at the stub equal the bytes without the rewriter. Every request holds the
  system prompt as a tail of its system blocks: build the rewriter as written. A side call has a
  system prompt of its own: the design does not ship as written, and the output goes to you with 2
  options, send a side call with its system prompt removed, or refuse the model.
- **provider order field.** Milestone 4. Blocks slice 4. The body field that OpenRouter's Messages
  route takes for a provider order. Read its docs ahead of `buildProviderOrder`, and confirm the
  field in the preview check of slice 4. The aggregator takes the order: the field stands. It
  ignores or refuses it: stop and report.
- **base URL path probe.** Milestone 4. Blocks slice 8. Each harness's CLI accepts a base URL with
  one more path segment. The slice creates
  `guests/conversation/src/sdk-contract/run-base-url-path-probe.agent-sdk.test.ts`; run it with
  `bun run test:agent-sdk`. The Codex case is in `guests/codex/src/run-turn.imp.test.ts`, by hand in
  a test imp. It passes: the capture tag rides in the base URL. It fails on a harness: the log
  covers no step on that harness, and each such step writes a `no_capture_point` miss.
- **rollback reads input records.** Milestone 4. Blocks part of slice 9. The last release a
  deployment ran reads past the 7 `model.input_*` kinds. By hand, on a copy of a test data
  directory: start the release under test, turn the log on, run 1 scripted turn, stop it, start the
  image of the last release on the same directory and run `nixie health`. It is ready: a rollback
  needs only the steps of slice 9. It is not ready: the rollback also needs the records removed,
  which nothing does, and the log's release waits for a design of that removal.
- **agent-sdk tool-call timeout.** Milestone 3. Blocks slice 2 and tasks slice 9. The Agent SDK
  runtime obeys a setting for the timeout of one MCP tool call. Read the pinned Agent SDK's type
  declarations and the CLI's settings. The slice creates
  `guests/conversation/src/sdk-contract/run-tool-call-wait-probe.agent-sdk.test.ts`; run it with
  `bun run test:agent-sdk`. With the timeout at 2 seconds, a tool that returns after 1 second gives
  its result and one that returns after 3 gives none: the definition declares 900,000. No setting,
  or the CLI ignores it: the definition declares null, and the result goes to you with what the
  SDK's docs state.
- **codex tool-call timeout.** Milestone 4. Blocks slice 6. The same for Codex. Read the config
  reference of the pinned CLI and check the key with
  `codex app-server --strict-config --print-startup-config`. Then 2 cases of
  `bun run test:imp guests/codex/src/run-turn.imp.test.ts`, by hand, with the timeout at 2 seconds.
  Both pass: the `codex` definition declares 900,000. No key, or Codex ignores it: null. The Codex
  harness does not wait for this check.

## Not written

- **defineHarness signature.** Milestone 4. Blocks slice 3. The signatures of `defineHarness` and
  `HarnessProfileSchema`. Only the names are agreed. Intended: `defineHarness` takes a definition
  and checks the `session` rule when the module loads; `HarnessProfileSchema` is a strict schema
  whose output is the harness's profile without `id`.
- **host error texts.** Milestone 4. Blocks slice 3. The text of each guest-neutral host error: the
  3 built errors that name "the conversation guest", the throw of `encodeHostFrame`, and the
  broken-contract failure of a step. Intended: each holds the name of the guest of the step's
  harness, or no guest's name.
- **turnInputs procedures.** Milestone 4. Blocks slice 9. The inputs and outputs of
  `turnInputs.list`, `turnInputs.open` and `turnInputs.set`, and the arguments of the 4
  `nixie turn-input` commands. Intended: `list` returns envelope fields and misses, `open` takes one
  input ID, `set` takes a state and an optional time.
- **capture tag layout.** Milestone 4. Blocks slice 8. The byte layout inside the `~in.` tag.
  Intended: the base64url of the capture ID and the public key, with a committed fixture.
- **harness ID lists test.** Milestone 4. Blocks no slice. A test that ties `harnessIDs` in the wire
  library to `harnesses` in the models module. Intended: one unit test that fails when either list
  holds an ID the other lacks. Rule 10 of [port rules](../port-rules.md) asks for it.
- **release pairs table.** Milestone 4. Blocks no slice. A table of what each pair of releases does:
  a host of one release against a record, a stored point or a config that another release wrote. The
  rollback notes in the slices hold the known cases. Rule 12 of [port rules](../port-rules.md) asks
  for it.
- **drop and reset cause.** Milestone 4. Blocks slice 9. Which `cause` a `model.input_removed`
  record holds when a reset or `nixie turn-input off --drop` removes a request. The 4 causes are
  `retention`, `byte_bound`, `forget` and `missing`.
- **codex config keys.** Milestone 4. Blocks slice 5. The Codex config keys that turn off Codex's
  own skills, agents and project docs, and each feature that adds text to the model's input unasked.
  The spike's files hold none of them.
- **miss reason triggers.** Milestone 4. Blocks slice 9. The miss reasons `unknown_capture` and
  `store_unavailable` are listed and have no stated trigger.

## Known faults

- **limit stop outcome.** Milestone 4. Blocks slice 3. One statement has a guest that stops at
  `limits.modelCalls` end "as an interrupted turn does". Another has it end with `outcome: 'limit'`.
  The docs follow `limit`.
- **session field name.** Milestone 4. Blocks slice 3. One statement gives the Codex record
  `listSessionFiles: null`. Another gives it `session: null`, with `session` in the place of
  `listSessionFiles`. The docs follow `session`.
- **wait milestone.** Milestone 3. Blocks slices 1 and 2. This family is milestone 4. The worker
  tool slice of the tasks family is milestone 3 and needs `toolCallWaitMs` with a number on the
  Agent SDK harness. The docs follow the dependency: slices 1 and 2 need nothing of milestone 4 and
  can land with the worker tool.
