# place-trust-card

Contents: [Journey](#journey), [End state](#end-state).

The user trusts a place from the card that holds a call, and later sees one line for each place the
assistant acted on. On `local`, a scripted model answers in place of the real one. It calls
`computer.screenshot`, then `computer.screen_click` at the point 640, 400, on the tab that
computer-browser left open on the harness site. nixie holds the click, and its card offers "Trust
this place to read" and "Trust this place to act" beside the approval. The first answer approves the
click, adds `pages.test` to the directory at `read` and writes no rule. Once the site is at `act`, a
second click runs with no card, and the conversation shows the notice of the act: one line that
names the site and the tool.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The `use-computer` action, the `trust-site` action and the page on
`pages.test` exist only in `local`'s test build. On `preview`, skip the journey and run no `done`.
In your reply, list the feature as not verified because it needs `local`.

The card's "Trust this place to act" answer takes a passkey, which a journey cannot give. Step 8
raises the site with the `trust-site` action, which writes the same change.

Before you start:

- Run [computer-browser](feature-computer-browser.md) first, in the same `up`. It leaves a tab open
  on the harness site, which the click lands on. Without that tab, the click lands on no browser
  window, and the card names no place.
- Run this journey once per `up`, and before [trusted-places](feature-trusted-places.md), because
  each of them adds the entry for `pages.test`. Before you run either again, even after a failed
  journey, run `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol,
  computer-browser and the journey, in that order.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature place-trust-card
   ```

2. Send the user's message and script the model's turn. `use-computer --kind screen` sends the
   message "Look at your screen and click the middle of it.", and queues 3 replies: a
   `computer.screenshot` call, a `computer.screen_click` call at 640, 400, and the text in `--text`.

   ```bash
   bun verify action use-computer --kind screen --text 'The assistant clicked the middle of the screen.'
   ```

   Expect: `data.replies` is 3.

3. Wait for the turn. Give `--reply` the same text as `--text` in step 2. The reply arrives before
   the approval, because nixie gives the model a tool result of `queued` for the held click.

   ```bash
   bun verify conversation turn --message 'Look at your screen and click the middle of it.' --reply 'The assistant clicked the middle of the screen.'
   ```

   Expect: exit 0. On a failure, follow its row in [Exit codes](exit-codes.md).

4. Check that nixie holds the click. Then script the model's text for the turn that the approval
   starts, or that turn fails.

   ```bash
   bun verify proposals --tool computer.screen_click --waiting pending
   bun verify action script-reply --text 'Thanks, I have your answer.'
   ```

   Expect: `proposals` exits 0, and `data.replies` is 1.

5. Open the approvals page, and take a snapshot:

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: one item that reads "Run computer.screen_click to pages.test:", then a port, then
   "(send).". Find the line that holds that text and `[cursor=pointer]`. Pass its `ref` as
   `<item_ref>`.

6. Expand the item, then answer with "Trust this place to read".

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --role button --name 'Trust this place to read'
   ```

   Expect: both clicks exit 0. The snapshot after the first click lists the buttons "Trust this
   place to read" and "Trust this place to act".

7. Check the answer. `proposals --waiting none` checks once, with no wait, and exits 0 when nixie
   holds no call of the tool.

   ```bash
   bun verify proposals --tool computer.screen_click --waiting none
   bun verify db query "select json_extract(payload, '$.outcome') as outcome from records where kind = 'proposals.settled' and json_extract(payload, '$.family') = 'action' order by sequence desc limit 1"
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'computer.screen_click'"
   bun verify db query "select kind, trust, origin from places"
   bun verify db query "select count(*) as rules from records where kind like '%rule%'"
   ```

   Expect: `proposals` exits 0. The first query returns one row, with `outcome` `approved`. The
   second returns one row, with `status` `done`. The third returns one row, with `kind` `site`,
   `trust` `read` and `origin` `added`. The fourth returns `rules` 0.

8. Raise the site to `act`, then send the same turn again. The entry now allows the click, so nixie
   holds nothing.

   ```bash
   bun verify action trust-site --domain pages.test --trust act
   bun verify action use-computer --kind screen --text 'The assistant clicked again.'
   bun verify conversation turn --message 'Look at your screen and click the middle of it.' --reply 'The assistant clicked again.'
   bun verify proposals --tool computer.screen_click --waiting none
   bun verify db query "select json_extract(payload, '$.tool') as tool from records where kind = 'places.acted'"
   ```

   Expect: `trust-site` returns the short ID of the entry in `data.place`, `data.replies` of
   `use-computer` is 3, and `proposals` exits 0. The query returns one row, with `tool`
   `computer.screen_click`.

9. Open the conversation, and take a snapshot:

   ```bash
   bun verify browser goto /
   bun verify browser snapshot
   ```

   Expect: after the last turn's tool line, a region named "places acted" that holds the heading
   "pages.test: computer.screen_click". The turn that the approval started shows no such region,
   because no place allowed the approved click.

## End state

- In step 6, the card offered both trust answers beside the approval.
- In step 7, nixie holds no call, the click's outcome is `done`, the directory holds `pages.test` at
  `read`, and the answer wrote no rule.
- In step 8, the second click ran with no card, and its call has one `places.acted` record.
- In step 9, the conversation shows one line, "pages.test: computer.screen_click".

Once the end state matches, run `bun verify done`.
