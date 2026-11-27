# trusted-places

Contents: [Journey](#journey), [End state](#end-state).

The user trusts a site once, and every tool reads the same answer. The user asks the assistant to
fetch a page and open it in its browser. On `local`, a scripted model answers in place of the real
one. It calls `web_fetch`, then `computer.browser_open`, on the harness's page on `pages.test`. Once
the site is trusted at read, nixie holds neither call, and the log shows that one entry of the
directory allowed both.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The `trust-site` action, the `use-computer` action and the page on
`pages.test` exist only in `local`'s test build. On `preview`, skip the journey and run no `done`.
In your reply, list the feature as not verified because it needs `local`.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- The features table lists [computer-browser](feature-computer-browser.md) first. When it ran since
  `up`, run `bun verify up --restart`, `doctor` and sign-in-enrol before this journey. Once the user
  approves `pages.test` in computer-browser, the browser no longer asks about it, and this journey
  no longer shows what trusting the site changes.
- No page adds a place yet, so the `trust-site` action adds the entry that the places page will add.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature trusted-places
   ```

2. Trust the site at read. The action adds the entry for `pages.test` to the directory, and puts a
   snapshot that holds it in force.

   ```bash
   bun verify action trust-site --domain pages.test
   ```

   Expect: `data.place` holds the short ID of the entry.

3. Send the user's message and script the model's turn. `use-computer --kind fetch-and-open` sends
   the message "Fetch the page, then open it in your browser.", and queues 3 replies: a `web_fetch`
   call on the harness's page, a `computer.browser_open` call on the same page, and the text in
   `--text`.

   ```bash
   bun verify action use-computer --kind fetch-and-open --text 'The assistant fetched and opened the page.'
   ```

   Expect: `data.replies` is 3.

4. Wait for the turn. Give `--reply` the same text as `--text` in step 3.

   ```bash
   bun verify conversation turn --message 'Fetch the page, then open it in your browser.' --reply 'The assistant fetched and opened the page.'
   ```

   Expect: exit 0. On a failure, do what its row in [Exit codes](exit-codes.md) says.

5. Check that nixie holds neither call. Each command checks once, with no wait.

   ```bash
   bun verify proposals --tool web_fetch --waiting none
   bun verify proposals --tool computer.browser_open --waiting none
   ```

   Expect: both exit 0.

6. Check that one place allowed both calls:

   ```bash
   bun verify db query "select json_extract(payload, '$.tool') as tool, json_extract(decision, '$.outcome') as outcome, json_extract(decision, '$.permissions[0].by') as by, json_extract(decision, '$.permissions[0].trust') as trust, json_extract(decision, '$.permissions[0].placeID') as place from records where kind = 'tool_called' and json_extract(payload, '$.tool') in ('web_fetch', 'computer.browser_open') order by sequence"
   ```

   Expect: 2 rows, `web_fetch` then `computer.browser_open`. Each has `outcome` `allow`, `by`
   `place` and `trust` `read`, and both rows show the same `place`.

## End state

- In step 2, the directory holds the site at read.
- In step 5, nixie holds no call of either tool. [computer-browser](feature-computer-browser.md)
  shows that the browser asks about a site that nobody trusted.
- In step 6, the decision of each call names the same place at read as its permission: `web_fetch`
  and the browser read one answer.

Once the end state matches, run `bun verify done`.
