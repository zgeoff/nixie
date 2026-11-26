# call-screen

Contents: [Journey](#journey), [End state](#end-state).

The call screen, `/call`, starts a call in the browser. The browser asks for the microphone, starts
the call and connects it to the speech layer over WebRTC. The screen shows the connection state, the
length of the call, a mute button and a hang up button. The card of a proposal that the call's turn
makes shows on the call screen of the device that carries the call. A hang up ends the call with
`endedBy: 'you'`.

Run this journey on `local` only, on an `up` of its own:

- On `local`, `NIXIE_VERIFY_CALLS=1 bun verify up` runs a test build of nixie with a scripted model,
  voice settings that price a call at 0.05 dollars a minute, and a fake speech layer in place of the
  provider. The test build gives each page a silent microphone, because the browser that
  `bun verify` drives has none. The `call-step` action plays the speech provider.
- On `preview`, skip this journey, and list the feature as not verified there in your reply. A
  preview has no fake speech layer, because only the local `up` reads `NIXIE_VERIFY_CALLS`.

Before you start:

- Run this journey last, after every other feature's journey, because it needs an `up` with
  `NIXIE_VERIFY_CALLS=1`.
- Run `NIXIE_VERIFY_CALLS=1 bun verify up --restart` and `bun verify doctor`. Then run
  [sign-in-enrol](feature-sign-in-enrol.md) again as set-up, which signs the browser in. It is not
  part of this journey.
- Run this journey once per `up`, because each step expects the first call since that `up`. To run
  it again, run the `up --restart` and `doctor` above first.

When a step exits with a code other than 0, follow the row for that code in
[Exit codes](exit-codes.md). When a step exits 0 and its `data` differs from the Expect line,
compare the app with the end state below, following step 5 of Check a change in the
[verify skill](../SKILL.md#check-a-change). When a snapshot lacks a step's Expect line, take up to 5
more, about a second apart. When the last one still lacks it, treat the step as differing from the
Expect line, and do the same comparison.

## Journey

1. Record every later command of this journey under this feature, queue the replies that the
   conversation's wakes on the call take, then open the call screen.

   ```bash
   bun verify use --feature call-screen
   bun verify action call-step --step prepare
   bun verify browser goto /call
   bun verify browser snapshot
   ```

   Expect: the snapshot holds the heading "Call", the text "No call" and a button "Start a call".

2. Start the call, and look at the screen.

   ```bash
   bun verify browser click --role button --name 'Start a call'
   bun verify browser snapshot
   ```

   Expect: the snapshot holds the text "Connected" and the buttons "Mute" and "Hang up". When it
   still holds "Connecting", take another snapshot, up to 5 times, about a second apart.

3. Check that the speech layer holds the call's one session.

   ```bash
   bun verify action call-step --step read
   ```

   Expect: exit 0, `data.callID` is null, and `data.speech` holds one `open` call and no `answer` or
   `say`. The `callID` is null because the `call-step` action sets it only when it starts a call
   itself, and here the browser started the call.

4. Have the speech layer hand off a request whose reply proposes a memory item, then look at the
   call screen.

   ```bash
   bun verify action call-step --step propose
   bun verify browser snapshot
   ```

   Expect: a snapshot holds the region "Proposals from this call" with the card of "The user keeps
   bees on the allotment.". When the snapshot lacks it, take another snapshot, up to 5 times, about
   a second apart.

5. Leave the call screen by a link of the app.

   ```bash
   bun verify browser click --role link --name Tasks
   bun verify browser snapshot
   ```

   Expect: the snapshot holds the region "Call in progress" with the text "On a call", the buttons
   "Mute" and "Hang up" and the link "Back to the call".

6. End the call from the speech provider's side while the other page shows, then go back to the call
   and read how the call ended.

   ```bash
   bun verify action call-step --step hang-up
   bun verify browser snapshot
   bun verify browser click --role link --name Call
   bun verify browser snapshot
   bun verify db query "select json_extract(payload, '$.endedBy') as endedBy from records where kind = 'call.ended'"
   ```

   Expect: the first snapshot no longer holds the region "Call in progress", because the page heard
   the end over its live stream with no click. The second snapshot holds "You hung up." and a button
   "Start another call". The query returns one row, whose `endedBy` is `you`.

## End state

- After step 2, the call is connected, and the speech layer holds one open session.
- After step 4, the call's thread holds the proposal, and its card shows on the call screen.
- After step 5, the call is still live, and the call bar shows on the other page.
- After step 6, the call has ended with `endedBy: 'you'`, and the screen offers a new call.
