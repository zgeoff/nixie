# computer-browser

Contents: [Journey](#journey), [End state](#end-state).

The user asks the assistant to open a page. On `local`, a scripted model answers in place of the
real one. It calls `computer.browser_open`, and nixie holds the call until the user approves the
site. Then nixie opens the page in the assistant's browser. The user then asks the assistant to go
to the site's next page in the same tab and reload it. The model calls `computer.browser_navigate`,
which nixie holds until the user approves the site again, because each tool keeps its own answers,
and `computer.browser_reload`, which never asks. In a deployment, that browser is Chromium on the
desktop of the computer sandbox. `local`'s test build has no desktop, so it runs Chromium headless.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The `use-computer` action and the page it opens, on the host
`pages.test`, exist only in `local`'s test build. On `preview`, skip the journey and run no `done`.
In your reply, list the feature as not verified because it needs `local`.

This journey does not check that the browser's network is closed. In a deployment, the browser runs
in the computer sandbox, beside the shell, and reaches sites only through the sandbox's checking
proxy. `local`'s test build runs it as a plain process, with no network limits.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`, before [computer-screen](feature-computer-screen.md), which needs
  the approval this journey gives. Once the user approves the site, nixie stops asking about it. A
  second journey finds no call to approve in step 4. Before you run it again, even after a failed
  journey, run `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature computer-browser
   ```

2. Send the user's message and script the model's turn. `use-computer --kind browser` sends the
   message "Open the page in your browser.", and queues 2 replies: a `computer.browser_open` call on
   the `pages.test` page, and the text in `--text`.

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
   bun verify proposals --tool computer.browser_open --waiting pending
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

   Expect: one item that reads "Run computer.browser_open to pages.test:", then a port, then
   "(fetch).". "fetch" is the effect that `computer.browser_open` declares. Find the line that holds
   that text and `[cursor=pointer]`. Pass its `ref`, such as `f3e32`, as `<item_ref>`.

7. Click the item to expand it, then click its approve button. Take the button's `ref` from the
   snapshot after the first click. Each snapshot gives every element a new `ref`. The button's name
   repeats the item's text without "(fetch).", so find the line that starts with
   `button "Run computer.browser_open to pages.test:`. Pass its `ref` as `<button_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<button_ref>'
   ```

   Expect: both clicks exit 0.

8. Check the call's outcome. `proposals --waiting none` checks once, with no wait, and exits 0 when
   nixie holds no call of the tool.

   ```bash
   bun verify proposals --tool computer.browser_open --waiting none
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'computer.browser_open'"
   ```

   Expect: `proposals` exits 0, and the query returns one row, with `status` `done`.

9. Send the user's second message and script the model's turn.
   `use-computer --kind browser-navigate` sends the message "Go to the next page in the same tab,
   then reload it.", and queues 3 replies: a `computer.browser_navigate` call on tab `t1` to the
   harness's `/next` page, a `computer.browser_reload` call on `t1`, and the text in `--text`.

   ```bash
   bun verify action use-computer --kind browser-navigate --text 'The assistant went to the next page and reloaded it.'
   ```

   Expect: `data.replies` is 3.

10. Wait for the turn. The reply arrives before the approval, as in step 3: nixie gives the model a
    tool result of `queued` for the held navigation. The reload runs at once, on the page the tab
    still shows.

    ```bash
    bun verify conversation turn --message 'Go to the next page in the same tab, then reload it.' --reply 'The assistant went to the next page and reloaded it.'
    ```

    Expect: exit 0. On a failure, do what its row in [Exit codes](exit-codes.md) says.

11. Check that nixie holds the navigation and asked nothing for the reload. Each command checks
    once, with no wait.

    ```bash
    bun verify proposals --tool computer.browser_navigate --waiting pending
    bun verify proposals --tool computer.browser_reload --waiting none
    ```

    Expect: both exit 0.

    Check that the reload loaded the page again. The harness's page counts its loads and shows the
    count, and nixie stores the page that each load returned:

    ```bash
    bun verify db query "select count(*) as reloaded from web_fetch_pages where url like '%/' and parts like '%Load 2%'"
    ```

    Expect: `reloaded` is 1. A reload that failed or never ran leaves 0.

12. Script the model's text for the turn that the approval starts, as in step 5:

    ```bash
    bun verify action script-reply --text 'Thanks, I have your answer.'
    ```

    Expect: `data.replies` is 1.

13. Open the approvals page, and take a snapshot:

    ```bash
    bun verify browser goto /proposals
    bun verify browser snapshot
    ```

    Expect: one item that reads "Run computer.browser_navigate to pages.test:", then a port, then
    "(fetch).". Find the line that holds that text and `[cursor=pointer]`. Pass its `ref` as
    `<item_ref>`.

14. Click the item to expand it, then click its approve button. Take the button's `ref` from the
    snapshot after the first click. Find the line that starts with
    `button "Run computer.browser_navigate to pages.test:`. Pass its `ref` as `<button_ref>`.

    ```bash
    bun verify browser click --ref '<item_ref>'
    bun verify browser snapshot
    bun verify browser click --ref '<button_ref>'
    ```

    Expect: both clicks exit 0.

15. Check the navigation's outcome:

    ```bash
    bun verify proposals --tool computer.browser_navigate --waiting none
    bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'computer.browser_navigate'"
    ```

    Expect: `proposals` exits 0, and the query returns one row, with `status` `done`.

## End state

- In step 4, nixie held one call of `computer.browser_open`.
- In step 6, the approvals page showed the site's host, `pages.test`, and its port.
- In step 8, nixie holds no call, and the call's outcome is `done`: nixie opened the page after the
  approval.
- In step 11, nixie held one call of `computer.browser_navigate` and none of
  `computer.browser_reload`: a reload never asks. The reload loaded the page a second time.
- In step 13, the approvals page showed the site's host, `pages.test`, and its port, for the
  navigation.
- In step 15, nixie holds no call, and the navigation's outcome is `done`: nixie loaded the next
  page in the same tab after the approval.

Once the end state matches, run `bun verify done`.
