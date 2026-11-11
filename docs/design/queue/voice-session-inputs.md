# The voice session: inputs

Bring these facts to the voice session, the design session whose agenda is
[the voice call session](voice-session.md). This doc lists what the decisions settle, what the
spikes measured, what the built code does, what the agent verifies in the speech provider's docs,
and each place where 2 sources disagree.

[Design sessions to run](design-sessions-to-run.md#terms) defines the terms and the labels that this
doc uses, such as GPT-Live, a hand-off, a step and question H1. The [glossary](../../glossary.md)
defines the rest. An item marked `(open: <name>)` is in [the open list](open/ports.md).

## What the decisions settle

The sources are decisions [0040](../../decisions/0040-voice-pipeline.md),
[0041](../../decisions/0041-approvals-during-a-voice-call.md),
[0009](../../decisions/0009-first-channel.md), [0002](../../decisions/0002-approvals.md) and
[0011](../../decisions/0011-memory-writes.md), and the [scope](../../scope.md).

Who speaks:

- GPT-Live hears and speaks the call. It answers small talk from nixie's persona, and it hands each
  request to nixie's conversation turn (0040, 0009).
- Claude writes the answer to every request, and GPT-Live speaks the answer (0040).
- GPT-Live speaks a short filler, such as "Sure, one moment", while the turn works. The filler never
  claims an outcome and never makes a promise (0040).
- nixie has no speech-to-text model and no turn detector of its own (scope).
- Piper, the text-to-speech voice of the pipelines in the reply report, is ruled out as nixie's
  voice (0040, the [reply report](../../../research/voice-latency/voice-reply.md)).

The waits:

- A reply meets 2 gates. The first audio comes at a median of 1.5 s or less from the end of your
  speech. A silence over 1 s inside the reply happens in fewer than 5% of turns (0040).
- You accept a wait of 1.7 to 3.8 s after the filler on a request that GPT-Live hands off (0040).

The record and approvals:

- nixie owns the call as a whole. It reconnects when a provider session ends, it holds a transcript
  of what you heard, and it brings in results that arrive during a call without interrupting
  (scope).
- A proposal's card shows in the call screen of the device that carries the call. A fixed template
  line announces the card, and nixie never sends a push to another device (0041).
- A spoken "yes" never approves (0041, 0002).
- Dictated text never counts as memory evidence. A memory write whose quote touches a `dictated`
  span is a proposal (0011).
- One client holds the conversation, approvals and voice (0009).
- Your audio goes from the host to the speech provider, which 0040 accepts as a cost. The principle
  "Your data stays home" governs storage. What the provider stores is one of the voice questions.

Facts from the rest of the queue design:

- Barge-in and echo are part of the voice session (open: barge-in reservation).
- nixie has no built-in note-taker and no built-in consolidator, and a built-in task never holds a
  memory tool. Only 2 things write memory from a call: the turn that answers a hand-off, and a
  started task whose `task.start` call allows it a memory tool.
- A test turn never goes to a production deployment. An acceptance check of a voice build issue uses
  synthetic audio in a nixie that the test spawns or in a preview stack. The only other acceptance
  check is a call that you place yourself.
- The call log holds timings and flags only. It never holds audio, and it never holds text.

Where a port fits, under [port rules](port-rules.md):

- A port fits the speech layer. A second provider is in sight: 0040 lists 2 alternatives, Grok Voice
  and a pipeline that ends in a streaming cloud voice.
- A port does not fit the turn that answers a request. That turn is nixie's conversation turn, and
  the model harness boundary owns it.
- A port does not fit echo cancellation, which happens on the device.

## What the spikes measured

Two spikes give the figures: the first-token spike, in `research/sdk-first-token`, and the
voice-latency spike, in `research/voice-latency`, which holds the
[reply report](../../../research/voice-latency/voice-reply.md).

The turn behind a call, from the first-token spike:

- The accepted wait of 1.7 to 3.8 s comes from one Agent SDK session that a process holds across the
  turns of a call, on Sonnet 5.5 at low effort.
- The Agent SDK adds about 270 ms to a turn on a fresh process.
- On Haiku 5.5, a resumed turn gives its first text at a median of 961 ms. A turn on a held process
  gives it at 566 ms.
- The spike has no figure for a resumed turn on Sonnet 5.5, and no figure for Opus 5.5.
- The spike picks Haiku 5.5 for voice, and it assumes a held process. The choice of model also sets
  the time to the first token.
- The spikes have no figure for a session that a step rebuilds from the event log during a call.

GPT-Live, from the voice-latency spike:

- The spike holds the provider's socket in a process of the spike's own. It opens one session with a
  voice, instructions, client delegation and the model `gpt-live-1`. Client delegation is the
  provider's feature that passes a request to the client, and a hand-off uses it.
- The spike answers a delegation with `session.commentary.append`.
- Of the settings that a provider session takes, the spike sets only `voice` and `instructions`, at
  session start. Its voice is `marin`. It has 3 stub tools.
- The spike tests neither the audio path to a device nor real microphone audio, and it never feeds a
  speakerphone.
- In the reply report, GPT-Live answers all 10 plain lines itself and delegates all 9 tool lines. It
  speaks the answer close to word for word, and once it adds a date. The report lists its wording
  over more than 3 tool lines as untested.
- GPT-Live starts its reply while the speaker is in mid-utterance in 28% of the AMI meeting set, 9%
  of the Harper Valley Bank set and 2% of the SLURP set.
- When the spike's caller interrupts a reply, GPT-Live stops a median of 1.47 s after the
  interruption starts.
- After an interruption at 1.5 s, the spike's caller has heard 1.8 s of a reply that is 8 to 16 s
  long, and the session holds the whole reply (open: heard reply figure).
- In the spike, GPT-Live sends no end-of-reply event and takes no client cancel event. The spike
  ends a reply after 2.5 s without sound. GPT-Live stops its own stream. Both events are on the list
  that the agent verifies.
- The reply report gives $0.065 a minute for GPT-Live with the delegated turns, and $0.033 for Grok
  Voice. The spike's code prices a minute at $0.05 for GPT-Live and $0.08 for Grok Voice. The 2
  pairs of figures may use different bases. The price is on the list that the agent verifies.
- The reply report records 30 days of retention for abuse monitoring, and zero retention on prior
  approval, which turns off recording downloads and session forking. The terms are on that list too.

## What the built code does

- Each step of the built conversation spawns the conversation guest for one turn.
- The intended design of the harness boundary, in [model harnesses](model-harnesses.md), has the
  same shape: a step sends one `turn` frame, and the guest handles one turn and ends. That design
  has no capability for a process that outlives a step.
- A harness without the `resume` capability stores no point to resume a session from, so each
  following step rebuilds the session from the event log.
- The reference configuration puts the conversation on Opus 5.5 at medium effort.
- The `conversation` role needs the capabilities `resume`, `live-messages` and `interrupt`, and
  nixie fails the config load on a profile that lacks one.
- `models.roles` is a strict object, so a release that lacks a role fails to load a config file that
  sets that role.
- A model profile is a route to an Anthropic-compatible endpoint, so GPT-Live does not fit one. The
  role map has 5 roles, and none is for voice.
- The server reads the deployment configuration once, at start. A profile change applies at the next
  start.
- Your definitions can override a built-in prompt.
- The span schema has 4 sources, and nixie rejects a span with any other source. `dictated` is not
  one of the 4. The client design adds it.
- The turn-input log captures requests at the counting proxy, on the way to a model API. The speech
  provider's session does not pass through the proxy. The log's roles are `conversation`, `task`,
  `worker` and `checker`.
- Presence is one bit for all of your device sessions.
- The budgets design has no voice cost.

## What the agent verifies in the provider's docs

Before the voice session, the agent reads the speech provider's docs for the price, the retention
terms and each of these (open: provider facts):

- the list of voices;
- whether speed is a setting;
- which settings a provider session accepts after it starts;
- which turn detection and interruption settings exist;
- the limit of a provider session;
- whether an end-of-reply event or a client cancel event exists;
- whether a provider setting cancels echo;
- whether the provider's events allow a rule for speech that resumes after a pause;
- whether the provider issues a short-lived credential for a device.

## Sources that disagree

Between docs, spikes and code:

- The [voice design](../platform/channels/voice.md) puts the turn that answers a request on one
  Agent SDK process that is open for the whole call. Decision 0040 is silent on it. The built
  conversation spawns one guest per turn. So one process per call is a choice, question H1, and it
  is not a given.
- The voice-latency spike's README measures against a gate of 2.5 s at the median. The gate of 0040
  is 1.5 s to first audio.
- The first-token spike picks Haiku 5.5 for voice. The reply report that 0040 rests on delegates to
  Sonnet 5.5.
- 0040 puts the cost of Grok Voice at "about half". The reply report's prices agree, and the prices
  in the spike's code put Grok Voice higher.
- 0041 has "the turn" speak the template line. Under 0040, GPT-Live speaks, and it answers small
  talk without nixie's turn.
- 0011 defines a `dictated` span as text that a voice client transcribed. Under 0040 the provider
  transcribes.

Between the voice call issue, which the open list links, and the docs:

- The issue's question 8 asks to fold in approvals during a call and dictated words as memory
  evidence. 0041 and 0011 settle both. What remains is to check each against GPT-Live as the
  speaker.
- Its question 2 lists prompt overrides as planned work. They are built.
- Its question 6 asks where a call commits its records. It takes that question from the voice
  design, and the voice design assumes one process for the whole call.
- It omits 3 things that the scope commits to: the reconnect when a provider session ends, the
  transcript of what you heard, and results that arrive during a call.
- It asks which voices and settings GPT-Live has, as if the repo held them. The repo holds one voice
  and one model ID.
