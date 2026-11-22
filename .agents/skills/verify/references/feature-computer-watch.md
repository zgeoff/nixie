# computer-watch

Contents: [Journey](#journey), [End state](#end-state).

The computer page at `/computer` shows the assistant's desktop live, view only. The page asks nixie
for a one-use watch address, opens a socket to it and draws the desktop. While the computer sleeps,
the page says "The computer is waking", and nixie wakes it. Once the viewer has drawn a picture, the
page says "Watching the computer". A connection that finishes the handshake and sends no picture
stays on "The computer is waking". The user can look but cannot touch: nixie drops every key,
pointer and clipboard message. `local`'s test build serves a fixed gradient picture in place of a
real desktop.

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
   bun verify browser snapshot --until-text 'Watching the computer'
   ```

   Expect: both commands exit 0. The status text appears once the viewer has drawn the picture, so
   the wait times out on a blank desktop. The snapshot shows the heading "Computer", the status
   "Watching the computer. You can look but not touch." and an image named "The computer's desktop".

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
   bun verify browser snapshot --until-text 'Watching the computer'
   ```

   Expect: all three commands exit 0. The second visit watches again with a new address.

## End state

- In step 2, the computer page showed "Watching the computer" and the desktop image.
- In step 3, no stored result held a watch address.
- In step 4, a second visit watched again.

Once the end state matches, run `bun verify done`.
