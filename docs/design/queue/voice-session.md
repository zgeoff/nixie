# The voice call session

This doc is the agenda of the voice session: the design session in which you and the agent settle
every open detail of a voice call. You answer the questions. The agent writes the voice design from
your answers and files the build issues. The doc gives the order of the decisions, the 5 contracts
to settle, what the voice design needs from other designs, the 2 checks that the agent does before
you sign off the voice design, and what comes out.

[Design sessions to run](design-sessions-to-run.md#terms) defines the terms and the labels that this
doc uses, such as GPT-Live, a hand-off, a contract and question H1. The facts to bring are in
[the voice inputs](voice-session-inputs.md). Each question, with its options, is in
[the voice questions](voice-session-questions.md), under the name that this doc uses for it. An item
marked `(open: <name>)` is in [the open list](open/ports.md).

## The order of the decisions

Each step lists the questions that its answer unblocks.

1. Before the voice session, decide the design of the harness boundary, which
   [model harnesses](model-harnesses.md) owns (open: waiting designs). H1 depends on the decision.
   - Under the intended design, each harness has one definition file, and a step on a harness that
     cannot resume rebuilds the model's session from the event log.
   - If you pick another design, H1 is the same question. The agent rewrites the options of H2 and
     H4 for that design before the voice session.
2. Say what your reservation on barge-in excludes. The voice session covers barge-in and echo with a
   reservation of yours, and the content of the reservation is not on record (open: barge-in
   reservation). Your answer sets how much of barge-in the voice session covers.
3. Decide where the speech provider's connection ends: on nixie's server or on your device. The
   answer unblocks contracts 1, 3, 4 and 5, echo cancellation and the spend limit.
4. Answer H1, and settle the hand-off (contract 1). Then answer H2, H3 and H4.
   - The 4 answers unblock the choice of model, the tools of a call, where a call commits and the
     hand-off wait in the call log.
   - H4 also unblocks how the client cancels, the rejoin rule and what happens when a task finishes
     during a call.
5. Pick the model for calls. Then answer H5: whether the agent measures the wait on that model
   before you sign off. Check 1 below is that measurement, and its result can reopen H1.
6. Decide which requests GPT-Live answers alone. The answer unblocks GPT-Live's memory and who
   speaks the fixed approval lines.
7. Settle the record of a call (contract 2), after H3. It unblocks `dictated` spans, the unheard
   part of a reply, memory from small talk and the reconnect when a provider session reaches its
   limit.
8. Settle the provider boundary (contract 3). It unblocks where each setting lives. The answer to
   where each setting lives unblocks which settings change during a call and what the turn-input log
   covers. The spend limit needs that answer and the answer of step 3.
9. Settle the carrying device (contract 4), after step 3.
10. Answer these at any point, because each depends on nothing: the voice, the persona, which
    settings you can change, the filler, how closely GPT-Live follows Claude's words, retention,
    turn detection and how a reply ends.
11. Settle the call log (contract 5) last, because it records the waits that H1 and the hand-off
    define.

## The 5 contracts

Each contract is costly to change and has more than one good design. You pick the design in the
voice session. The bullets under each contract are requirements that every design of it meets.

1. **The hand-off between the speech layer and nixie's conversation turn.** The contract fixes what
   the turn receives and what the speech layer gets back. You and the agent settle it right after
   H1, because option A and option B of H1 give different contracts.
   - The turn receives enough of the call so far to answer a request that refers to small talk that
     the turn never saw.
   - A turn that fails, ends on a proposal or passes a limit gives the speech layer something to say
     that claims no outcome.
   - When you cancel a request or talk over it, either the request stops costing model time, or
     nixie drops its answer and records the answer as unheard.
2. **The record of a call.** GPT-Live and Claude both write to one conversation record, playback
   drops part of some replies, and a call can crash.
   - The next turn's context holds what you heard, and never the part of a reply that playback
     dropped.
   - Recovery after a crash never replays speech that you heard before the crash.
   - Recovery after a crash never presents a stale step token to the action queue.
   - Every word that enters the record from your speech carries the `dictated` mark, whether
     GPT-Live or Claude answered it.
3. **The speech provider boundary and its settings.** The speech provider is neither a model profile
   nor a connector.
   - A swap of the provider changes no policy decision and no record kind.
   - A missing or refused provider credential stops a call at its start with a named error, and
     never stops nixie.
   - The deployment's provider credential never reaches a device.
   - The boundary hides the gaps of one provider, such as a missing end-of-reply event.
4. **Naming the device that carries a call.**
   - A proposal's card reaches the call screen of the carrying device, and nixie never sends a push
     to another device during the call.
   - After a call moves, nixie marks only the device that carries it. After a call drops, nixie
     marks none.
5. **The per-turn call log.** The tuning pass, which tunes the voice settings after the voice build,
   reads it.
   - Each turn records its wait to first audio, its hand-off wait, and whether GPT-Live cut you off
     or you interrupted it.
   - The log holds no audio and no text.
   - The log's totals are enough to compare the calls before a settings change with the calls after
     it. The comparison does not need the raw calls.

## What the voice design needs from other designs

Each bullet links the owning doc when this folder has that doc.

- **The harness boundary**, in [model harnesses](model-harnesses.md). The voice design needs your
  decision on it before H1. Under option B of H1, the voice design also needs a capability for the
  held process. The boundary design has no such capability.
- **The turn-input log.** The log's roles must cover a hand-off turn. Under option 1 of H2, nixie
  logs the turn under the `conversation` role. Under option 2, the log needs a 5th role, with the
  name of the model role for calls. The speech provider's own requests are outside the log.
- **The table of which actor holds which memory tool**, in the memory design. The table has 3
  actors: the conversation, a task and a worker. The speech layer is a 4th actor that speaks as
  nixie, so the table needs a column for it. The intended content of the column: no memory tool.
- **The memory blocks at the opening of a model session**, in the memory design. The voice design
  needs a rule on whether nixie may send any block to the speech provider as instructions. The
  memory design has no such rule.
- **The rule for a deploy and a rollback.** The voice build adds config keys and record kinds that
  the release before the voice build cannot read. Each voice build issue needs a rollback note under
  that rule.

## Checks before sign-off

The agent does these checks during the voice session and shows you the results. It does check 1
after you pick the model for calls, unless your answer to H5 skips the measurement. It does check 2
only under option 2 of H2. Their results are not known (open: resumed turn wait) (open: unknown role
key).

1. **How long a resumed turn and a turn on a held process take to their first text.** The agent
   measures both on the model that you pick for calls and on the conversation's model. The benchmark
   is in the first-token spike. It needs a model credential, and the spike's README gives the full
   command with the credential. The benchmark sends no turn to any deployment. From
   `research/sdk-first-token`:

   ```sh
   bun install
   env -u ANTHROPIC_API_KEY bun bench.ts --out results/<run_name>.jsonl --samples 10 \
     --models <call_model_id>,<conversation_model_id> --modes resume,stream
   bun report.ts results/<run_name>.jsonl --by model,mode
   ```

   `<run_name>` is a name for the result file. `<call_model_id>` and `<conversation_model_id>` are
   the 2 model IDs. The mode `resume` is a resumed turn, and the mode `stream` is a turn on a held
   process.
   - If the median of the resumed turn is inside the wait that you accept, option A of H1 holds on
     that model. You state the wait that you accept in the voice session, before the agent shows the
     result.
   - If the median is outside that wait, you choose between option B, another model and a longer
     accepted wait.
   - The medians of the 2 models show whether a separate model for calls answers sooner.
   - You confirm the 2 gates of [decision 0040](../../decisions/0040-voice-pipeline.md) for the
     voice design only after this result.

2. **Whether a release without a model role for calls loads a config file that sets one.** The agent
   writes a case in `models-config-schema.test.ts`, the test file of the models config schema, on
   the code as built: a `roles` section with one unknown key. The expected result is that the load
   fails, because `models.roles` is a strict object.
   - If the load fails, the build issue that adds the role states that a rollback removes the key
     before the release before the voice build starts.
   - If the load passes, that build issue states that the release before the voice build ignores the
     key.

## What comes out

- A docs pull request with the voice design. `bun run check:docs` passes on the pull request, and
  you approve the pull request.
- The voice design has no open question. On the pull request's branch,
  `git grep -n "^## Open questions" -- docs/design/platform/channels/voice.md` prints nothing. On
  the main branch before the pull request, the command prints one line. The command proves only that
  the voice design's own "Open questions" section is gone.
- The pull request description lists each question of the voice questions with the line of the voice
  design or of decision 0040 that answers it. The agent writes the list, and you read it.
- The build issues exist in the tracker. The tuning pass is blocked by the last voice build issue in
  build order. The agent reads the blocked-by list of the tuning pass to confirm it.

The agent files build issues for the items below that your answers call for. The release before the
voice build reads none of these items, and none has a name yet.

- Config keys for the speech provider, its credential and its limits.
- Record kinds for the call, its turns, the small talk and the heard part of a reply.
- A record kind for the per-turn call log.
- An API procedure for the 2-way stream of a call on the typed API. It applies if the provider's
  connection ends on nixie's server.
- An API procedure that hands a device a short-lived provider credential. It applies if the
  connection ends on the device.
- The span source `dictated`. nixie rejects a span whose source the built span schema lacks.
- A config key for a model role for calls, under `models.roles`. It applies only under option 2 of
  H2. Check 2 gives its rollback note.
- A harness capability for the held process. It applies only under option B of H1, and the harness
  boundary owns it.

## Not in scope

- The build of the voice call. The agent files its issues, and builders take them.
- The tuning pass.
- A design for a speech provider port. Contract 3 comes first.
