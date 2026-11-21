# computer-browser

Contents: [Journey](#journey), [End state](#end-state).

The user asks the assistant to open a page. nixie calls `computer.open`, which opens the page in the
assistant's own browser, a headless Chromium in a sandbox of its own, and returns the page text.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. On `local`, the test build runs the guest as a plain process, with
no egress enforcement, and the harness serves its own page on a `.test` host, so nothing reaches the
internet. `preview` has no such page. There, skip this journey and run no `done`. In your reply,
list the feature as not verified on `preview`, and say the test sandbox cannot show that the network
is closed to the guest.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Before you run it again, even after a failed pass, run
  `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature, then script the model's next turn.
   `--kind browser` queues 2 replies: a `computer.open` call on the harness page, and the reply that
   follows it.

   ```bash
   bun verify use --feature computer-browser
   bun verify action use-computer --kind browser --text 'The assistant opened the page.'
   ```

   Expect: `data.replies` is above 0, the count of scripted model replies it queued.

2. Send the message. `conversation turn` waits up to 10 s for the message and the reply in the event
   log.

   ```bash
   bun verify browser goto /
   bun verify conversation turn --message 'Open the page in your browser.' --reply 'The assistant opened the page.'
   ```

   Expect: `conversation turn` exits 0. On a failure, do what its row in [Exit codes](exit-codes.md)
   says.

3. Check that nixie holds the call and did not run it. The first open of a site asks the owner, so
   the call waits as an approval for that site:

   ```bash
   bun verify proposals --tool computer.open --waiting pending
   bun verify action script-reply --text 'Thanks, I have your answer.'
   ```

   Expect: `proposals` exits 0. The second command returns `data.replies` of 1, the text of the turn
   that your answer starts.

4. Open the approvals page, expand the item and approve it. Take each `ref` from the snapshot just
   before its click: the item is the line that holds "Run computer.open to" and `[cursor=pointer]`,
   and after the first click the approve button is named "Run computer.open to" followed by the
   site.

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<button_ref>'
   ```

   Expect: the item reads "Run computer.open to pages.test:" and a port. Both clicks exit 0.

5. Check the answer. `proposals --waiting none` checks once, with no wait:

   ```bash
   bun verify proposals --tool computer.open --waiting none
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' order by sequence desc limit 1"
   ```

   Expect: `proposals` exits 0, and `status` is `done`.

## End state

- Step 3: one pending approval for `computer.open`, which names the site's host and port.
- Step 5: the call's action ended `done`: nixie opened the harness page in the browser after the
  approval, and not before.

Once the end state matches, run `bun verify done`.
