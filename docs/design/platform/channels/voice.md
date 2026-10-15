# Voice calls

- Decisions: [0040](../../../decisions/0040-voice-pipeline.md),
  [0041](../../../decisions/0041-approvals-during-a-voice-call.md)

A voice call runs as a pipeline under [0040](../../../decisions/0040-voice-pipeline.md):
speech-to-text, nixie's own turn on one Agent SDK process that stays open for the whole call, and
text-to-speech of each sentence as it arrives. A proposal made during the call shows its card in the
call screen under [0041](../../../decisions/0041-approvals-during-a-voice-call.md), and the
[client](client.md) holds the call screen. Two questions stay open before voice work starts.

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

[0041](../../../decisions/0041-approvals-during-a-voice-call.md) shows a proposal's card on the
device that carries the call, and sends no push to your other devices during the call. Presence is
one bit for all device sessions: the push notifier knows whether any client showed the conversation
recently, never which device did ([the channel adapter](channel-adapter.md)). Nothing therefore
names the device that carries a call.

The open question is how nixie learns which device session carries a call, so the card reaches that
device and the push rule can tell it apart from your other devices.
