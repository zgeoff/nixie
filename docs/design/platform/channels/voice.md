# Voice calls

- Decisions: [0040](../../../decisions/0040-voice-pipeline.md)

GPT-Live hears and speaks a voice call under [0040](../../../decisions/0040-voice-pipeline.md). It
answers small talk itself, and it hands each request to nixie's own turn, which runs on one Agent
SDK process that stays open for the whole call. While the turn runs, GPT-Live speaks a short filler,
such as "Sure, one moment", which never claims an outcome or makes a promise. A proposal made during
the call shows its card in the call screen, as
[approvals in the client](approvals.md#during-a-voice-call) covers, and the [client](client.md)
holds the call screen. Two questions stay open before voice work starts.

## Latency gates

A reply meets 2 gates: first audio at a median of 1.5 s or less from the end of your speech, and a
silence over 1 s inside the reply in fewer than 5% of turns. A request that GPT-Live hands to
nixie's turn misses the silence gate, because you wait after the filler while the turn runs.

## Open questions

### Where a call commits

A task step commits its records at its end, and a crash reruns the step from its start
([tasks](../core/tasks.md)). A voice call keeps one guest process open across every turn of the
call, so the call has no commit point inside that process. A crash mid-call leaves two bad outcomes:

- The rerun step repeats the turns since the last commit, so you hear speech again that you heard
  before the crash.
- The guest outlives its step, and keeps a step token whose step no longer holds the task's claim.
  The token is dead: the action queue refuses every queued call made with it.

The open question is where a call commits, and what a crash mid-call replays.

### Which device carries the call

A proposal's card shows on the device that carries the call, and no push goes to your other devices
during the call ([approvals in the client](approvals.md#during-a-voice-call)). Presence is one bit
for all device sessions: the push notifier knows whether any client showed the conversation
recently, never which device did ([the channel adapter](channel-adapter.md)). Nothing therefore
names the device that carries a call.

The open question is how nixie learns which device session carries a call, so the card reaches that
device and the push rule can tell it apart from your other devices.
