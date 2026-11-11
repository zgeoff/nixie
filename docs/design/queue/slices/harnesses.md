# Harnesses: the work as slices

The docs are [model harnesses](../model-harnesses.md),
[turn outcomes and harness sessions](../harness-sessions.md),
[the Codex harness](../codex-harness.md), [tasks on OpenRouter models](../openrouter-tasks.md),
[the turn-input log](../turn-input-log.md) and [the turn-input store](../turn-input-store.md). The
sketches are in `../sketches/harnesses/`. Open items are in [the open list](../open/harnesses.md),
each named here as `(open: <name>)`.

Slices 8 and 9, the turn-input log, are in [the turn-input log slices](harnesses-log.md).

Each "Needs" line is a settled dependency. The order between slices that share no dependency is not
settled. (open: harness slice order)

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked. No check sends a turn to a production deployment. Before a deploy that adds
a profile, check the rendered config with the schema of the nixie release that the deployment pins.
A rollback goes to the last release the deployment ran
([decision 0049](../../../decisions/0049-milestone-deploys-and-the-rollback-target.md)).

Each slice has the ID `harnesses-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `harnesses-n`.
[The work list](../work-list.md) gives the build order.

### harnesses-1. The tool-call wait field

[The worker tool issue](https://linear.app/zgeoff/issue/GEO-1793) waits for it.

- **Outcome:** The harness record holds `toolCallWaitMs`, null on each harness, and the turn frame
  holds `limits.toolCallWaitMs`, which the host copies from the record.
- **Follows:** "The tool-call wait" in model harnesses; `02-types.ts`, sections C and E.
- **Needs:** nothing. It lands ahead of harnesses-3 and adds the field to `HarnessDescriptor`.
  harnesses-3 then carries the field onto `Harness`. tasks-9, the worker tool, needs this slice.
  (open: wait milestone)
- **Check:**
  - `bun test libs/wire/src/host-frame.test.ts`: a turn frame parses with a number and with null in
    `limits.toolCallWaitMs`, and fails to parse without the key.
  - `bun test modules/sessions/src/run-guest-turn.test.ts`: the turn frame that the host sends holds
    the record's `toolCallWaitMs`.
- **Rollback:** no step. The field is code of one release and is stored nowhere. Host and guest
  images ship together.
- **Milestone:** 3, with tasks-9, which needs this slice. The other slices of this family are
  milestone 4. (open: wait milestone)

### harnesses-2. The Agent SDK tool-call wait

[The worker tool issue](https://linear.app/zgeoff/issue/GEO-1793) waits for it.

- **Outcome:** The `agent-sdk` record declares 900,000, and the conversation guest passes the
  frame's value to the CLI.
- **Follows:** "The tool-call wait" in model harnesses.
- **Needs:** harnesses-1. (open: agent-sdk tool-call timeout): the slice declares 900,000 only when
  its pull request shows the probe passing, and declares null otherwise.
- **Check:**
  - `bun run test:agent-sdk guests/conversation/src/sdk-contract/run-tool-call-wait-probe.agent-sdk.test.ts`
    (agent-sdk lane; the slice creates the file): with the timeout at 2 seconds, a tool that returns
    after 1 second gives its result, and one that returns after 3 gives none.
  - `bun test guests/conversation/src/build-query-options.test.ts`: the options hold the frame's
    `limits.toolCallWaitMs` in the setting that the probe found.
- **Milestone:** 3, with tasks-9, which needs this slice. The other slices of this family are
  milestone 4. (open: wait milestone)

### harnesses-3. The harness boundary

[The Codex harness issue](https://linear.app/zgeoff/issue/GEO-2237).

- **Outcome:** Host code holds a `Harness` from `bindHarness`, each harness has one definition,
  `encodeHostFrame` is the host's only encoder, `ended` carries `outcome`, a step on a harness with
  no session runs from `unkept`, and host errors name no one guest. The `getHarness` file and
  `HarnessDescriptor` are gone. The architecture doc on model profiles and the glossary describe the
  result.
- **Follows:** every section of model harnesses but "The tool-call wait"; every section of turn
  outcomes and harness sessions; "A profile on the Codex harness" and "The Codex definition" in the
  Codex harness; `02-types.ts`, sections A to J; `03-flow.ts`, sections A to C.
- **Needs:** harnesses-1. (open: boundary design), (open: outcome values), (open: definition home),
  (open: defineHarness signature), (open: host error texts), (open: codex effort pin), (open: limit
  stop outcome), (open: session field name). The image key tuple and the size table of the sandboxes
  family give `imageKey` and `sizeRows` their types ([sandbox images](../sandbox-images.md),
  [sandbox sizes](../sandbox-sizes.md)). This slice lands ahead of sandboxes-6, which needs it:
  `imageKey` is a string that the manifest's loader checks, and sandboxes-6 narrows it and adds
  `sizeRows`.
- **Work beside the code:**
  - The architecture doc on model profiles opens with "one Anthropic-compatible endpoint", and its
    text has each role's needs checked. Correct both.
  - Add the terms of this family to the glossary.
  - The list of overflow reasons moves from the host into the Agent SDK guest.
- **Check:**
  - `bun test libs/wire/src/host-frame-needs.test.ts` (the slice creates the file):
    `encodeHostFrame` throws for each frame and each field against a capability set without its
    need.
  - `bun test modules/sessions/src/pick-session-position.test.ts`: a harness with no session is
    `fresh`, then `unkept`, whatever point is stored; a point with no `harness` key is `resumable`
    on `agent-sdk`. One more case follows (open: agent-sdk unkept).
  - `bun test modules/sessions/src/build-step-result.test.ts`: a step on a harness with no session
    stores a null point.
  - `bun test modules/sessions/src/run-live-turn.test.ts` (the slice creates the file), on a test
    harness without `resume`, `live-messages` and `summarize`: the step sends no resume point, no
    `message` frame and no `summarize` frame.
  - `bun test modules/models/src/model-turn-ended-codec.test.ts`: a payload with `outcome` decodes
    under a copy of the codec without the key.
  - `bun test modules/models/src/models-config-schema.test.ts`: the config refuses a `codex` profile
    on the conversation role and names each missing capability; it refuses a `codex` profile that
    holds `auth_header`.
  - A test beside the Agent SDK guest's mapping function (the slice creates the file): one case for
    each Agent SDK row of the outcome table.
  - `bun run test:e2e` (e2e lane), with the scripted model: a conversation resumes, takes a live
    message and compacts, with every suite of the lane passing.
  - `git grep -nE "['\`]the conversation guest" -- modules/sessions/src` prints nothing: no string
    in the sessions module opens with those words.
- **Deploy:** host and guest images ship together, because `outcome` is required.
- **Rollback:** the last release's schema for `harness` holds no `codex`, so it refuses a config
  with one. Remove each `codex` profile first. That release reads a `model.turn_ended` with
  `outcome`, because a codec's `decode` drops a key that it does not know. A stored session point
  parses as it did. (open: release pairs table)
- **Milestone:** 4.

### harnesses-4. Tasks on OpenRouter models

[The OpenRouter tasks issue](https://linear.app/zgeoff/issue/GEO-2234).

- **Outcome:** A profile states `outside_claude` and a provider pin, the 3 load rules refuse their
  cases, the turn profile carries `requestRewrite`, and the conversation guest removes the CLI
  blocks on a loopback rewriter. The SDK contract suite reads its model and base URL from 2
  variables.
- **Follows:** every section of tasks on OpenRouter models; `01-usage.ts`, section B; `02-types.ts`,
  sections C, K and L; `03-flow.ts`, section E.
- **Needs:** nothing. (open: request change place), (open: missing mark refusal), (open: system
  blocks probe), (open: provider order field). It builds against the harness record that stands:
  `toTurnProfile` on `HarnessDescriptor` ahead of harnesses-3, and the Agent SDK definition's `bind`
  after it. (open: openrouter harness record) It needs no answer on production routing and no change
  to the counting proxy. The `context_tokens` rule is in the pull request only when (open: long
  prompt probe) passes, and the rest does not wait for that probe.
- **Check:**
  - `bun test guests/conversation/src/rewrite-model-request.test.ts` (the slice creates the file):
    both CLI blocks are gone, the tail's blocks hold their cache markers, the provider order is on a
    messages request only, and each refusal returns its text.
  - `bun test guests/conversation/src/start-request-rewriter.test.ts` (the slice creates the file):
    a refused request never reaches the stub upstream, a frame with a null `requestRewrite` starts
    no listener, and a request holds the base URL's whole path prefix.
  - `bun test apps/counting-proxy/src/make-proxy-handler.test.ts`: the body of a Claude route and
    the body of a route outside Claude each reach the stub upstream byte for byte.
  - `bun test modules/models/src/models-config-schema.test.ts`: each of the 3 load rules refuses its
    case with its text. When the long-prompt probe passes, a profile for a model outside the
    catalogue with `context_tokens: 400000` loads. This last case rests on an open item and is no
    gate.
  - `bun test modules/sandbox/src/find-kept-sandbox.test.ts`: a started task's sandbox whose spec
    holds the guest image of another release is not reused for a step after an upgrade.
  - Agent SDK lane: the probes of (open: system blocks probe) and (open: long prompt probe).
  - Model API lane, by hand in a test sandbox, for each model:
    `NIXIE_SDK_CONTRACT=1 bun run test:model-api`, with `NIXIE_SDK_CONTRACT_MODEL` and
    `NIXIE_SDK_CONTRACT_BASE_URL` set to the profile's values. Post the output on the pull request
    with each failing probe named. It needs an OpenRouter grant from you.
  - Preview stack, by the preview API check runbook, with the same grant: one turn asks the
    conversation to start a task on that model, and the records show the task's report as a task
    message. The same check shows that the broker swaps the credential on the rewriter's request and
    that the aggregator takes the provider order.
- **Deploy:** an upgrade can meet a refusal at its first start. A config with a pin on a Claude
  profile, or with a model ID without `claude` and without the mark, loaded on the last release and
  is refused on this one. The message holds the profile's ID. Correct the config ahead of the
  deploy. A deployment lists a model in `models.selectable` only after the model's own model API
  lane check and preview check.
- **Rollback:** the last release's strict profile schema refuses `outside_claude`. Remove the key
  and every selectable entry on such a profile first. When the `context_tokens` rule is built, also
  lower each cap above 200,000 first.
- **Milestone:** 4.

### harnesses-5. The Codex guest and image

[The Codex harness issue](https://linear.app/zgeoff/issue/GEO-2237).

- **Outcome:** The guest package `codex` runs one turn through `codex app-server`, the image pins
  one CLI version, and a `codex` profile runs a task on a test sandbox and in a test imp.
- **Follows:** "The Codex guest" and "The config the guest writes" in the Codex harness;
  `03-flow.ts`, sections C and D.
- **Needs:** harnesses-3, sandboxes-6, sandboxes-7, memory-gate-2, memory-gate-3. sandboxes-6 gives
  the image set. This slice's pull request adds the `codex` image key, its record and the
  `codexTask` size row to it, as [the sandbox image slices](sandboxes-images.md) state. sandboxes-7
  comes before the first pull request that adds an image. memory-gate-2 and memory-gate-3 delete the
  2 built-in memory tasks, under the intended answer of (open: codex memory roles). (open: codex
  effort values), (open: codex secret header), (open: codex config keys).
- **Check:**
  - `bun test guests/codex/src/run-turn.test.ts` (the slice creates the file), against a fake
    app-server: one tool-using turn emits `assistant`, `call` and `ended`; an error notification
    ends with `failed` and no `ended`; a closed stream ends with `failed`; a turn at
    `limits.modelCalls` ends with the outcome `limit`.
  - A test in `guests/codex` (the slice creates the file): one case for each Codex row of the
    outcome table.
  - `bun test guests/codex/src/remove-session-state.test.ts` (the slice creates the file): after a
    `purge` frame, the Codex home holds no thread.
  - Test imp, by hand, in the pull request that adds the `codex` image: the sandbox family's check
    that measures the `codexTask` row.
- **Milestone:** 4.

### harnesses-6. The Codex tool-call wait

[The Codex harness issue](https://linear.app/zgeoff/issue/GEO-2237).

- **Outcome:** The `codex` record declares 900,000, and the Codex guest writes the frame's value
  into the config of nixie's MCP server.
- **Follows:** "The tool-call wait" in model harnesses.
- **Needs:** harnesses-1, harnesses-5. (open: codex tool-call timeout): the slice declares 900,000
  only when its pull request shows the 2 cases passing. harnesses-7 does not wait for this slice.
- **Check:** `bun run test:imp guests/codex/src/run-turn.imp.test.ts` (imp lane, by hand; slice 7 or
  this slice creates the file, whichever lands first): the 2 cases of the open item.
- **Milestone:** 4.

### harnesses-7. The Codex gates

[The Codex harness issue](https://linear.app/zgeoff/issue/GEO-2237).

- **Outcome:** Each gate of "The release gates" has passed, and a deployment may name a `codex`
  profile in `models.selectable`.
- **Follows:** "The release gates" in the Codex harness.
- **Needs:** harnesses-5. A paid API key from you. (open: codex tool output limit), (open: codex
  untested paths).
- **Check:**
  - `bun run test:imp guests/codex/src/run-turn.imp.test.ts` (imp lane, by hand), with the real CLI:
    one tool-using turn through a counting proxy `openai-responses` route, with the proxy's count
    equal to the sum of the `call` frames; the cases of the 2 open items; the Codex case of (open:
    base URL path probe).
  - Preview stack, by the preview API check runbook, with the same key: one turn asks the
    conversation to start a task on the Codex entry, and the records show its report as a task
    message priced on the profile's table.
- **Milestone:** 4.
