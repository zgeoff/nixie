# computer-watch

Contents: [Journey](#journey), [End state](#end-state).

The computer page at `/computer` shows the assistant's desktop live. The page asks nixie for a
one-use watch address, opens a socket to it and draws the desktop. While the computer sleeps, the
page says "The computer is waking.", and nixie wakes it. Once the viewer has drawn a picture, the
page says "Your input won't reach the computer until you take over." A connection that finishes the
handshake and sends no picture stays on "The computer is waking.". The page is view only until the
user takes over: "Take over" gives the user's device the keys and pointer of the desktop, and the
assistant's calls that change the desktop wait. "Hand back" gives the desktop back. Each take-over
and hand-back writes a record that the assistant reads. nixie drops clipboard messages always.
`local`'s test build serves a fixed gradient picture in place of a real desktop.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The stand-in desktop exists only in `local`'s test build. On
`preview`, skip the journey and run no `done`. In your reply, list the feature as not verified
because it needs `local`.

Before you start, run [sign-in-enrol](feature-sign-in-enrol.md) in the same `up`, when you have not
run it since `up`.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature computer-watch
   ```

2. Open the computer page, and wait for the desktop:

   ```bash
   bun verify browser goto /computer
   bun verify browser snapshot --until-text 'reach the computer until you take over'
   ```

   Expect: both commands exit 0. The status text appears once the viewer has drawn the picture, so
   the wait times out on a blank desktop. The snapshot shows the heading "Computer", the status
   "Your input won't reach the computer until you take over.", a button "Take over" and an image
   named "The computer's desktop".

3. Check that nixie stored no watch address:

   ```bash
   bun verify db query "select count(*) as leaked from client_actions where procedure = 'computer.watch' and result like '%ticket%'"
   ```

   Expect: one row, with `leaked` 0. The stored result holds no address, because a retry of the call
   mints a fresh one.

4. Leave the page, and come back to it:

   ```bash
   bun verify browser goto /images
   bun verify browser goto /computer
   bun verify browser snapshot --until-text 'reach the computer until you take over'
   ```

   Expect: all three commands exit 0. The second visit watches again with a new address.

5. Take over the desktop, and check the record:

   ```bash
   bun verify browser click --role button --name 'Take over'
   bun verify browser snapshot --until-text 'You have taken over the computer'
   bun verify db query "select kind from records where kind like 'computer.takeover_%' order by sequence"
   ```

   Expect: all three commands exit 0. The snapshot shows a button "Hand back". The query returns one
   row, `computer.takeover_started`.

6. Hand the desktop back, and check the records:

   ```bash
   bun verify browser click --role button --name 'Hand back'
   bun verify browser snapshot --until-text 'Take over'
   bun verify db query "select kind from records where kind like 'computer.takeover_%' order by sequence"
   ```

   Expect: all three commands exit 0. The query returns 2 rows, `computer.takeover_started` then
   `computer.takeover_ended`.

## End state

- In step 2, the computer page showed "Your input won't reach the computer until you take over." and
  the desktop image.
- In step 3, no stored result held a watch address.
- In step 4, a second visit watched again.
- In step 5, the page offered "Hand back" and nixie held one start record.
- In step 6, the page offered "Take over" again and nixie held the start record and the end record.

Once the end state matches, run `bun verify done`.
