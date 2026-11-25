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

After this journey, run `bun verify up --restart`, `bun verify doctor` and sign-in-enrol before any
journey that sends a message. The hand-back record starts a conversation turn, and the journey gives
that turn no reply, so the turn fails.

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

5. Script the assistant's ask for a take-over, send a message, and wait for the banner. The scripted
   turn calls `computer.handover` with the reason, then replies:

   ```bash
   bun verify action script-reply --handover '{"reason":"itch.io asks for a CAPTCHA"}' --text 'I asked you to take over.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Please sign in on itch.io.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Please sign in on itch.io.' --reply 'I asked you to take over.'
   bun verify browser snapshot --until-text 'asks you to take over the computer: itch.io asks for a CAPTCHA'
   bun verify db query "select kind from records where kind like 'computer.handover_%' order by sequence"
   ```

   Expect: each command exits 0, and `data.replies` of the first is 3. The snapshot shows a banner
   with the reason and a button "Take over". The query returns one row, `computer.handover_asked`.

6. Answer the ask with the banner's Take over button, and check the records:

   ```bash
   bun verify browser click --role button --name 'Take over'
   bun verify browser snapshot --until-text 'You have taken over the computer'
   bun verify browser snapshot --until-no-text 'asks you to take over the computer'
   bun verify db query "select kind from records where kind like 'computer.takeover_%' order by sequence"
   ```

   Expect: all four commands exit 0. The banner can stay a few seconds after the page shows the
   take-over, so the second snapshot waits for it to go. The page is `/computer`. It shows a button
   "Hand back" and no banner. The query returns one row, `computer.takeover_started`. No
   `computer.handover_closed` record follows, because the user answered the ask by taking over.

7. Hand the desktop back, and check the records:

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
- In step 5, the page showed the banner with the assistant's reason, and nixie held one
  `computer.handover_asked` record.
- In step 6, the banner's Take over opened the computer page, which offered "Hand back" with no
  banner, and nixie held one start record.
- In step 7, the page offered "Take over" again and nixie held the start record and the end record.

Once the end state matches, run `bun verify done`.
