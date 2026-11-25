# call-hand-off

Contents: [Journey](#journey), [End state](#end-state).

A call is a live voice conversation. The speech layer talks to the user, and hands each question
that needs nixie to a turn on the call's own thread. The turn's reply goes back to the speech layer
as one answer. When no answer starts within `hold_after_ms` of a hand-off, nixie has the speech
layer say the holding line from `voice/lines.yaml`, "One moment.". When the call ends, a last turn
writes a summary, and nixie reports it to the conversation.

Run this journey on `local` only, on an `up` of its own:

- On `local`, `NIXIE_VERIFY_CALLS=1 bun verify up` runs a test build of nixie with a scripted model,
  voice settings that price a call at 0.05 dollars a minute, and a fake speech layer in place of the
  provider. The `call-step` action plays the user and the provider on that layer.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- Run this journey last, after every other feature's journey, because it needs an `up` with
  `NIXIE_VERIFY_CALLS=1`.
- Run `NIXIE_VERIFY_CALLS=1 bun verify up --restart` and `bun verify doctor`.
- Run this journey once per `up`, because each step expects the first call since that `up`. To run
  it again, run the `up --restart` and `doctor` above first.

When a step exits with a code other than 0, do what its row in [Exit codes](exit-codes.md) says.
When a step exits 0 and its `data` differs from the Expect line, compare the app with the end state
below, as step 5 of Check a change in the [verify skill](../SKILL.md#check-a-change) says.

## Journey

1. Record every later command of this journey under this feature, then start the call. The step
   connects it with no device.

   ```bash
   bun verify use --feature call-hand-off
   bun verify action call-step --step start
   ```

   Expect: exit 0, a `data.callID`, and `data.speech` that holds one `open` call and no `answer` or
   `say`.

2. Have the speech layer hand off one question. The model's reply to it waits.

   ```bash
   bun verify action call-step --step hand-off
   ```

   Expect: exit 0.

3. Move the clock past the hold time. The step waits for the holding line.

   ```bash
   bun verify action call-step --step hold
   ```

   Expect: `data.speech` holds a `say` call whose `text` is "One moment.", and no `answer` call.

4. Release the reply.

   ```bash
   bun verify action call-step --step release
   ```

   Expect: `data.speech` holds exactly one `answer` call, whose `text` is "You have two things
   today.", after the `say` call.

5. Hang the call up, then read the records of the call.

   ```bash
   bun verify action call-step --step hang-up
   bun verify db query "select kind from records where kind like 'call.%' order by sequence"
   bun verify db query "select count(*) as reports from records where kind = 'task_message' and json_extract(payload, '$.kind') = 'report'"
   ```

   Expect: the first query lists `call.started`, `call.answered`, `call.spoke` for the small talk,
   `call.handed_off`, `call.spoke` for the holding line, `call.closing` and `call.ended`, in that
   order. The second query returns 1 or more.

## End state

- After step 1, the speech layer holds an open session.
- After step 3, the speech layer has said the holding line once and has no answer yet.
- After step 4, the speech layer has one answer for the one hand-off.
- After step 5, the call's thread holds the small talk, the hand-off and the closing, and the
  conversation holds the call's report.
