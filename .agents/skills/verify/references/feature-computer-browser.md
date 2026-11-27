# computer-browser

Contents: [Journey](#journey), [End state](#end-state).

The user asks the assistant to open a page. On `local`, a scripted model answers in place of the
real one. It calls `computer.browser_open`. The call only fetches, and no place of the directory
names the site, so nixie runs it at once and opens the page in the assistant's browser. The user
then asks the assistant to go to the site's next page in the same tab and reload it. The model calls
`computer.browser_navigate` and `computer.browser_reload`, which run at once too. In a deployment,
that browser is Chromium on the desktop of the computer sandbox. `local`'s test build has no
desktop, so it runs Chromium headless.

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
  the tab that this journey leaves open. A second journey finds the page loaded a third time in
  step 8. Before you run it again, even after a failed journey, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol.

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
   event log. Give `--reply` the same text as `--text` in step 2.

   ```bash
   bun verify conversation turn --message 'Open the page in your browser.' --reply 'The assistant opened the page.'
   ```

   Expect: exit 0. On a failure, do what its row in [Exit codes](exit-codes.md) says.

4. Check that nixie held nothing and opened the page. `proposals --waiting none` checks once, with
   no wait, and exits 0 when nixie holds no call of the tool. The page is stored when the browser
   loads it.

   ```bash
   bun verify proposals --tool computer.browser_open --waiting none
   bun verify db query "select count(*) as stored from web_fetch_pages where url like '%/'"
   ```

   Expect: `proposals` exits 0, and the query returns one row, with `stored` 1.

5. Send the user's second message and script the model's turn.
   `use-computer --kind browser-navigate` sends the message "Go to the next page in the same tab,
   then reload it.", and queues 3 replies: a `computer.browser_navigate` call on tab `t1` to the
   harness's `/next` page, a `computer.browser_reload` call on `t1`, and the text in `--text`.

   ```bash
   bun verify action use-computer --kind browser-navigate --text 'The assistant went to the next page and reloaded it.'
   ```

   Expect: `data.replies` is 3.

6. Wait for the turn. Give `--reply` the same text as `--text` in step 5.

   ```bash
   bun verify conversation turn --message 'Go to the next page in the same tab, then reload it.' --reply 'The assistant went to the next page and reloaded it.'
   ```

   Expect: exit 0. On a failure, do what its row in [Exit codes](exit-codes.md) says.

7. Check that nixie held neither call:

   ```bash
   bun verify proposals --tool computer.browser_navigate --waiting none
   bun verify proposals --tool computer.browser_reload --waiting none
   ```

   Expect: both exit 0.

8. Check that the navigation and the reload each loaded the `/next` page. The harness's page counts
   its loads, and nixie stores the page that each load returned.

   ```bash
   bun verify db query "select count(*) as loaded from web_fetch_pages where url like '%/next'"
   ```

   Expect: `loaded` is 2. A reload that failed or never ran leaves 1.

9. Check how the decision point allowed each call:

   ```bash
   bun verify db query "select json_extract(payload, '$.tool') as tool, json_extract(decision, '$.outcome') as outcome, json_extract(decision, '$.rule.id') as rule, json_extract(decision, '$.permissions[0].by') as by from records where kind = 'tool_called' and json_extract(payload, '$.tool') like 'computer.browser%' order by sequence"
   ```

   Expect: 3 rows, `computer.browser_open`, `computer.browser_navigate` and
   `computer.browser_reload`. Each has `outcome` `allow`, `rule` `allow-reads` and `by` `reading`:
   the site has no place, and the call only fetches.

## End state

- In step 4, nixie held no call of `computer.browser_open`, and the page it opened is stored.
- In step 7, nixie held no call of `computer.browser_navigate` or `computer.browser_reload`.
- In step 8, the navigation and the reload each loaded the `/next` page.
- In step 9, the starter rule `allow-reads` allowed each call, with the permission `reading`.
  [trusted-places](feature-trusted-places.md) shows the same calls under a place at `read`.

Once the end state matches, run `bun verify done`.
