# computer-browser

Contents: [Journey](#journey), [End state](#end-state).

The user asks the assistant to open a page. On `local`, a scripted model answers in place of the
real one. It calls `computer.open`, and nixie holds the call until the user approves the site. Then
nixie opens the page in the assistant's browser, a headless Chromium.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The `use-computer` action and the page it opens, on the host
`pages.test`, exist only in `local`'s test build. On `preview`, skip the journey and run no `done`.
In your reply, list the feature as not verified because it needs `local`.

This journey does not check that the browser's network is closed. In a deployment, the browser runs
in a sandbox of its own. `local`'s test build runs it as a plain process, with no network limits.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Once the user approves the site, nixie stops asking about it. A
  second journey finds no call to approve in step 4. Before you run it again, even after a failed
  journey, run `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature computer-browser
   ```

2. Send the user's message and script the model's turn. `use-computer --kind browser` sends the
   message "Open the page in your browser.", and queues 2 replies: a `computer.open` call on the
   `pages.test` page, and the text in `--text`.

   ```bash
   bun verify action use-computer --kind browser --text 'The assistant opened the page.'
   ```

   Expect: `data.replies` is 2.

3. Wait for the turn. `conversation turn` waits up to 10 s for the message and the reply in the
   event log. Give `--reply` the same text as `--text` in step 2. The reply arrives before the
   approval: nixie gives the model a tool result of `queued` for the held call at once, and holds
   the call itself as a proposal.

   ```bash
   bun verify conversation turn --message 'Open the page in your browser.' --reply 'The assistant opened the page.'
   ```

   Expect: exit 0. On a failure, do what its row in [Exit codes](exit-codes.md) says.

4. Check that nixie holds the call and did not run it. `proposals --waiting pending` checks once,
   with no wait, and exits 0 when nixie holds exactly one call of the tool.

   ```bash
   bun verify proposals --tool computer.open --waiting pending
   ```

   Expect: exit 0.

5. Script the model's text for the turn that the approval starts. Without it, that turn fails. No
   step checks that turn's reply.

   ```bash
   bun verify action script-reply --text 'Thanks, I have your answer.'
   ```

   Expect: `data.replies` is 1.

6. Open the approvals page, and take a snapshot:

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: one item that reads "Run computer.open to pages.test:", then a port, then "(fetch).".
   "fetch" is the effect that `computer.open` declares. Find the line that holds that text and
   `[cursor=pointer]`. Pass its `ref`, such as `f3e32`, as `<item_ref>`.

7. Click the item to expand it, then click its approve button. Take the button's `ref` from the
   snapshot after the first click. Each snapshot gives every element a new `ref`. The button's name
   repeats the item's text without "(fetch).", so find the line that starts with
   `button "Run computer.open to pages.test:`. Pass its `ref` as `<button_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<button_ref>'
   ```

   Expect: both clicks exit 0.

8. Check the call's outcome. `proposals --waiting none` checks once, with no wait, and exits 0 when
   nixie holds no call of the tool.

   ```bash
   bun verify proposals --tool computer.open --waiting none
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'computer.open'"
   ```

   Expect: `proposals` exits 0, and the query returns one row, with `status` `done`.

## End state

- In step 4, nixie held one call of `computer.open`.
- In step 6, the approvals page showed the site's host, `pages.test`, and its port.
- In step 8, nixie holds no call, and the call's outcome is `done`: nixie opened the page after the
  approval.

Once the end state matches, run `bun verify done`.
