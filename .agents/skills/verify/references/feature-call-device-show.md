# call-device-show

Contents: [Journey](#journey), [End state](#end-state).

During a call, the assistant keeps its spoken reply short and puts a long answer on the call's
device, then says where it is. The user opens the Device view from the app's menu to read it, goes
back to the call, and the call stays live the whole time.

Run this journey on `local` only, on an `up` of its own, after the other features' journeys, as
[call-screen](feature-call-screen.md) is:

- On `local`, `NIXIE_VERIFY_CALLS=1 bun verify up` runs a test build of nixie with a scripted model,
  voice settings that price a call at 0.05 dollars a minute, and a fake speech layer in place of the
  provider. The test build gives each page a silent microphone. The `call-step` action plays the
  speech provider.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- Run `NIXIE_VERIFY_CALLS=1 bun verify up --restart` and `bun verify doctor`. Then run
  [sign-in-enrol](feature-sign-in-enrol.md) again as set-up, which signs the browser in. It is not
  part of this journey.
- Run this journey once per `up`, because each step expects the first call since that `up`.

When a step exits with a code other than 0, follow the row for that code in
[Exit codes](exit-codes.md). When a step exits 0 and its `data` differs from the Expect line,
compare the app with the end state below, following step 5 of Check a change in the
[verify skill](../SKILL.md#check-a-change). When a snapshot lacks a step's Expect line, take up to 5
more, about a second apart. When the last one still lacks it, treat the step as differing from the
Expect line.

## Journey

1. Record every later command under this feature, queue the replies that the conversation's wakes on
   the call take, start the call from the call screen, and read the screen.

   ```bash
   bun verify use --feature call-device-show
   bun verify action call-step --step prepare
   bun verify browser goto /call
   bun verify browser click --role button --name 'Start a call'
   bun verify browser snapshot
   ```

   Expect: the snapshot holds the text "Connected" and the buttons "Mute" and "Hang up". When it
   still holds "Connecting", take another snapshot.

2. Have the speech layer hand off a request whose reply puts a week of plans on the call's device,
   and read what the speech layer was told.

   ```bash
   bun verify action call-step --step show
   ```

   Expect: exit 0, and `data.speech` holds an `answer` whose `text` is "I've put that on your
   screen." and holds no line of the plans.

3. Open the Device view from the menu, and read it:

   ```bash
   bun verify browser click --role link --name 'Device view'
   bun verify browser snapshot
   bun verify browser screenshot
   ```

   Expect: the snapshot holds the region "Call in progress" with the text "On a call", the region
   "Device view", and in it the heading "This week" and the text "Monday: dentist at 9, then the
   allotment", then each later day of the week, ending with "Friday: tidy the shed". The screenshot
   shows the heading and every line of the plans whole, with the last line above the bottom edge of
   the window and no line cut off or hidden behind the call bar. A snapshot holds clipped text too,
   so only the screenshot shows that the page does not clip.

4. Go back to the call, hang up, and read how the call ended.

   ```bash
   bun verify browser click --role link --name 'Back to the call'
   bun verify browser snapshot
   bun verify browser click --role button --name 'Hang up'
   bun verify browser snapshot
   bun verify db query "select json_extract(payload, '$.endedBy') as endedBy from records where kind = 'call.ended'"
   ```

   Expect: the first snapshot holds the text "Connected" and the button "Hang up", so the call
   stayed live while the Device view showed. The second holds "You hung up.". The query returns one
   row, whose `endedBy` is `you`.

## End state

- After step 2, the speech layer got a short answer, and the plans went to the device.
- After step 3, the Device view drew the plans, and the call bar showed on the page.
- After step 4, the call was live when the user came back to it, and ended with `endedBy: 'you'`.
