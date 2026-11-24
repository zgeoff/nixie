# computer-screen

Contents: [Journey](#journey), [End state](#end-state).

The user asks the assistant to look at its screen and click the middle of it. On `local`, a scripted
model answers in place of the real one. It calls `computer.screenshot`, then `computer.screen_click`
at the point 640, 400, on the tab that computer-browser left open on the harness site. The
screenshot runs at once. nixie holds the click until the user approves it, because a screen act on a
browser window is a `send` to the host of the tab it lands on. In a deployment, the screen is the
desktop of the computer sandbox. `local`'s test build has no desktop, so a stand-in drives the
headless browser, with one browser window the size of the display.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The `use-computer` action and the page it opens, on the host
`pages.test`, exist only in `local`'s test build. On `preview`, skip the journey and run no `done`.
In your reply, list the feature as not verified because it needs `local`.

This journey does not check that nixie refuses a click on the terminal or on the address bar. The
stand-in has neither, and the guest's tests cover both refusals.

Before you start:

- Run [computer-browser](feature-computer-browser.md) first, in the same `up`. It leaves a tab open
  on the harness site, which the click lands on. Without that tab, the click lands on no browser
  window, and nixie asks for approval without naming a host.
- Run this journey once per `up`. Before you run it again, even after a failed journey, run
  `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol, computer-browser and
  this journey, in that order.
- Keep the table's order, which runs computer-shell first. This journey's end state holds either
  way: computer-shell changes only `isDiskNew`, which this journey does not check.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature computer-screen
   ```

2. Send the user's message and script the model's turn. `use-computer --kind screen` sends the
   message "Look at your screen and click the middle of it.", and queues 3 replies: a
   `computer.screenshot` call, a `computer.screen_click` call at 640, 400, and the text in `--text`.

   ```bash
   bun verify action use-computer --kind screen --text 'The assistant clicked the middle of the screen.'
   ```

   Expect: `data.replies` is 3.

3. Wait for the turn. `conversation turn` waits up to 10 s for the message and the reply in the
   event log. Give `--reply` the same text as `--text` in step 2. The reply arrives before the
   approval: nixie gives the model a tool result of `queued` for the held click at once, and holds
   the click itself as a proposal.

   ```bash
   bun verify conversation turn --message 'Look at your screen and click the middle of it.' --reply 'The assistant clicked the middle of the screen.'
   ```

   Expect: exit 0. On a failure, follow its row in [Exit codes](exit-codes.md).

4. Check that nixie holds the click and did not run it:

   ```bash
   bun verify proposals --tool computer.screen_click --waiting pending
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

   Expect: one item that reads "Run computer.screen_click to pages.test:", then a port, then
   "(send).". Find the line that holds that text and `[cursor=pointer]`. Pass its `ref` as
   `<item_ref>`.

7. Click the item to expand it, then click its approve button. Take the button's `ref` from the
   snapshot after the first click. The button's name repeats the item's text without "(send).", so
   find the line that starts with `button "Run computer.screen_click to pages.test:`. Pass its `ref`
   as `<button_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<button_ref>'
   ```

   Expect: both clicks exit 0. The snapshot after the first click shows a group named "Screen this
   click lands on" that holds an image, and a marker named "Click point 640, 400".

8. Check the outcomes. `proposals --waiting none` checks once, with no wait, and exits 0 when nixie
   holds no call of the tool.

   ```bash
   bun verify proposals --tool computer.screen_click --waiting none
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'computer.screen_click'"
   bun verify db query "select json_extract(res.payload, '$.outcome') as outcome from records call join records res on json_extract(res.payload, '$.callID') = json_extract(call.payload, '$.callID') where call.kind = 'tool_called' and res.kind = 'tool_result' and json_extract(call.payload, '$.tool') = 'computer.screenshot'"
   bun verify db query "select count(*) as pictures from record_attachments where sequence in (select sequence from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'computer.screen_click')"
   ```

   Expect: `proposals` exits 0. The first query returns one row, with `status` `done`. The second
   returns one row, with `outcome` `result`. The third returns one row, with `pictures` 1: the
   desktop after the click, sealed under the outcome record.

## End state

- In step 4, nixie held one call of `computer.screen_click`.
- In step 6, the approvals page showed the host `pages.test` and its port, with the effect `send`.
- In step 7, the expanded item showed the screenshot of the click with the marker at 640, 400.
- In step 8, nixie holds no call, the click's outcome is `done`, and the model's one call of
  `computer.screenshot` returned a result. The click's outcome holds one picture.

Once the end state matches, run `bun verify done`.
