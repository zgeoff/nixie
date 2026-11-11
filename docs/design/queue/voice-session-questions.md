# The voice session: questions

You answer these questions in the voice session, whose agenda is
[the voice call session](voice-session.md). Each question has a short name in bold, its options, the
intended option where the design work prefers one, and the questions that it depends on. A question
with no "Depends on" line depends on nothing. The agenda's section "The order of the decisions"
lists what each answer unblocks.

[Design sessions to run](design-sessions-to-run.md#terms) defines the terms, such as GPT-Live, a
hand-off, a step, a capability and "intended". The facts and figures behind the questions are in
[the voice inputs](voice-session-inputs.md). "Contract 1" to "contract 5" are the 5 contracts in the
agenda. Decisions are cited by number: [0040](../../decisions/0040-voice-pipeline.md),
[0041](../../decisions/0041-approvals-during-a-voice-call.md),
[0011](../../decisions/0011-memory-writes.md) and [0043](../../decisions/0043-paid-tool-budgets.md).
"The scope" is the [scope doc](../../scope.md). An item marked `(open: <name>)` is in
[the open list](open/ports.md).

## The turn behind a call

- **H1. Is a hand-off an ordinary conversation step, or does a call hold one process open?**
  - Option A: each request is an ordinary step. The step starts a fresh process and resumes the
    model's session from the stored point. Each request commits at the end of its step, and a crash
    reruns the step of one request. Option A needs nothing from the harness boundary.
  - Option B: one process is held open for the call. Option B needs 3 things: a harness capability
    that the boundary design lacks, a commit point inside the process, and a step token that
    outlives its step.
  - Intended: A, with the wait measured again before you sign off (H5).
  - The cost of A is a longer wait on each hand-off. On Haiku 5.5, a resumed turn reaches its first
    text about 400 ms after a turn on a held process does. The spikes have no such figure for
    another model.
  - The wait that you accepted in 0040, 1.7 to 3.8 s, was measured under B on Sonnet 5.5. 0040 has 2
    gates, and one is a silence over 1 s in fewer than 5% of turns. A handed-off turn fails that
    gate, and 0040 accepts the failure at the wait that the first-token spike measured.
- **H2. Under A, which model role does a hand-off use?**
  - Option 1: the `conversation` role and its profile.
  - Option 2: a role for calls, with its own profile and its own list of needed capabilities.
  - Every profile of the `conversation` role can resume, so under option 1 a call never lands on a
    harness that rebuilds the model's session on every request. Under option 2, the needed
    capabilities of the role for calls decide whether such a harness is allowed. The spikes have no
    figure for the wait of a rebuild.
  - Intended: option 2, with `resume` as a needed capability. A call can then use another model than
    the conversation, and never a harness that rebuilds. The cost: a release without the role fails
    to load a config file that has the role's key under `models.roles`.
  - Depends on: H1.
- **H3. Under A, what records the small talk that GPT-Live answered without a step?**
  - Option 1: the speech layer's transcript. nixie appends it to the conversation record before the
    next hand-off.
  - Option 2: nothing. The turn sees only the requests.
  - Contract 1 requires the turn to answer a request that refers to small talk. The record has no
    kind for small talk.
  - Intended: option 1, because the scope commits nixie to hold what you heard.
  - Depends on: H1.
- **H4. Under A, what happens to a request that arrives while the previous one is in progress?**
  - Option 1: the request waits for the next step.
  - Option 2: the request enters the turn in progress as a live message.
  - Option 3: the request interrupts the turn in progress.
  - Under the `conversation` role, every profile declares `live-messages` and `interrupt`, so all 3
    options are possible. Under a role for calls, nixie sends a `message` frame or an `interrupt`
    frame only to a harness that declares the capability.
  - Depends on: H1, H2 and the barge-in reservation.
- **H5. Does the agent measure the 2 gates of 0040 and the accepted wait again, on the chosen
  model?**
  - Option 1: measure before you sign off. Check 1 of the agenda is the measurement.
  - Option 2: accept the longer wait unmeasured.
  - Option 3: hand the measurement to the tuning pass.
  - Depends on: H1 and the model for calls.
- **The model for calls. Which Claude model writes the answers?**
  - Options: the conversation's profile; a profile of its own for calls.
  - Intended: a profile for calls on Sonnet 5.5 at low effort, the one model that the accepted wait
    was measured on. The tuning pass may move it.
  - H2 decides whether a role for calls exists. This question picks the model of that role, or
    confirms the conversation's model.
  - Depends on: H1 and H2.
- **Where a call commits. What does a crash replay?**
  - The voice design asks this question for a held process. Under option A of H1, each hand-off
    commits as a step does, and the question is closed. Under option B, contract 2 answers it.
  - Depends on: H1.
- **The tools of a call. Which tools does a hand-off turn have?**
  - Options: the conversation's full tool list; a shorter list.
  - Depends on: H1.

## Where the audio flows

- **The provider's connection. Where does the speech provider's connection end?**
  - Option 1: on nixie's server, which relays audio to the device.
  - Option 2: on the device, with a short-lived credential that nixie hands out.
  - The answer decides who receives the delegation event, where the provider credential lives, how
    nixie learns the carrying device, where nixie enforces a spend limit and what the call log can
    time. The choice touches secrets and production safety. The docs and decisions are silent on it.
  - Intended: none. The design work prefers no option, because the choice needs the provider's docs
    on a credential for a device, and a test of the audio path.

## The record and memory

- **What GPT-Live answers alone. Which requests does GPT-Live answer without a hand-off?**
  - Options: small talk only; small talk and questions about the call itself; nothing.
  - Intended: small talk only, as 0040 words it, with every question about your data handed off.
    This question is about identity: who speaks as nixie.
- **GPT-Live's memory. Does GPT-Live get any of nixie's memory for small talk?**
  - Options: none; the pinned memory items; what a hand-off returns.
  - Intended: none for the first build. Small talk needs no memory, and a request reaches memory
    through the hand-off.
  - Depends on: what GPT-Live answers alone.
- **Memory from small talk. Does anything save memory from small talk?**
  - Options: nothing; the next hand-off turn sees the transcript and may write.
  - Under 0011, a turn's write that quotes speech is a proposal.
  - Intended: nothing for the first build.
  - Depends on: H3.
- **`dictated` spans. What is a `dictated` span on a GPT-Live call?** Under 0011, a `dictated` span
  marks text that a voice client transcribed from speech.
  - Options: the provider's transcript of your speech, stored as a message with `dictated` spans; no
    message record for small talk.
  - Depends on: H3.
- **The unheard part of a reply. How does the record mark it?** Contract 2 sets the requirement.
  Depends on: H1, H3 and the barge-in reservation.
- **The turn-input log. Does the log cover what nixie sends the speech provider?**
  - Options: not covered; a record of the instructions and of each answer handed back.
  - Depends on: where each setting lives.
- **Claude's words. How closely must GPT-Live follow them?**
  - Options: word for word; paraphrase allowed.

## Approvals and results in a call

- **The fixed approval lines. Who speaks the template line of 0041 and the fixed reply to a spoken
  "yes"?**
  - Options: GPT-Live under a rule; nixie's conversation turn; a clip that the client plays.
  - GPT-Live answers small talk itself, so a spoken "yes" may never reach nixie's turn.
  - Intended: a clip that the client plays. 0041 uses a template so that a model never describes the
    card.
  - Depends on: what GPT-Live answers alone.
- **A task that finishes during a call. What does nixie do with its result?**
  - Options: hold the result until a pause; show it on screen only.
  - Depends on: H4.
- **The carrying device. Which device carries the call?** Contract 4 sets the requirement, and the
  [voice design](../platform/channels/voice.md#which-device-carries-the-call) has the detail.
  Depends on: the provider's connection.

## Voice, persona and settings

- **The voice. Which voice does a call use?**
  - Options: `marin`, the voice of the voice-latency spike; another voice from the provider's list.
- **The settings you can change. Can you change the voice, the speed and the persona text?**
  - Options for each of the 3: fixed in code; set in the deployment configuration; set in the
    definitions.
  - The options overlap with those of "where each setting lives", so answer the 2 questions
    together.
- **The persona. Which persona text reaches GPT-Live?**
  - Options: the same persona text that the conversation uses; a spoken variant in the definitions;
    a built-in prompt with an override.
  - GPT-Live and Grok Voice, the 2 speech-to-speech models that the reply report compares, both take
    the persona and the spoken-reply rules as session instructions.
- **Where each setting lives. Which store holds each setting that you can change?**
  - Options: the deployment configuration; the definitions; the client.
  - Intended: the deployment configuration holds the provider, its key and its limits. The
    definitions hold the persona text and the voice, because the persona is a definition.
  - Depends on: contract 3, which you and the agent settle first, and the settings you can change.
- **Settings during a call. When does a changed setting apply?**
  - Options: no setting changes; a change applies at the next call; a change applies live.
  - Depends on: where each setting lives.
- **The filler. What does GPT-Live say while the turn works?**
  - Options: GPT-Live's own words under a rule; a fixed set of lines.
  - 0040 rules out a filler that claims an outcome or makes a promise.

## GPT-Live's options

- **Turn detection. Which turn detection and interruption settings does a call use?**
  - Options: the provider's defaults; tuned values.
- **The reconnect. What does a call do when a provider session reaches its limit?**
  - Options: reconnect inside the call; end the call.
  - The scope commits nixie to reconnect, so "end the call" needs a change to the scope.
  - Depends on: H3, because the reconnect needs the transcript.
- **The spend limit. What does a minute cost, and which limit applies?**
  - Option 1: a budget per day and per month, as paid tools have.
  - Option 2: a limit per call.
  - Option 3: the call's cost counts toward the dollar limits of the models.
  - Intended: option 1. Call minutes cost real dollars, and the dollar limits of the models count
    notional dollars (0043).
  - Depends on: where each setting lives, and the provider's connection.
- **Retention. What does the provider store of the audio?**
  - Options: the provider's default; zero retention.
  - Intended: ask for zero retention if the provider offers it, and accept the loss of recording
    downloads. Retention touches production safety.

## Gaps of the provider, barge-in and echo

- **How a reply ends. How does nixie tell that a reply ended, without an end-of-reply event?**
  - Options: a quiet spell ends the reply, as the voice-latency spike does with 2.5 s; a marker in
    the transcript stream.
- **How the client cancels. How does the client stop a reply, without a client cancel event?**
  - Options: drop the buffered audio on the device; close and reopen the provider session.
  - Depends on: H4 and the barge-in reservation.
- **Echo cancellation. Which one does a call use?**
  - Options: the browser's and the device's own; a rule that a call needs a headset; a provider
    setting.
  - Intended: test the device's own echo cancellation with playback through a speaker, and then
    choose.
  - Depends on: the provider's connection.
- **The rejoin rule. When does speech after a pause count as part of the same turn?**
  - Options: rely on GPT-Live's own turn-taking; add a rule on its events.
  - The starting point for a rule: your speech that resumes within 1 s of your pause counts as part
    of the same turn.
  - Depends on: H4 and the barge-in reservation.
- **The barge-in reservation. What does your reservation on barge-in exclude?**
  - The voice session covers barge-in and echo with a reservation of yours. The content of the
    reservation is not on record, so you state it (open: barge-in reservation).
  - H4, how the client cancels, the rejoin rule and the unheard part of a reply depend on it.
