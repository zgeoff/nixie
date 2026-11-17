# memory-approval

The model can propose a memory item, a fact about the user that nixie keeps. When the user's own
words in the conversation do not state the fact, nixie holds the item as a proposal until the user
approves it on the approvals page, `/proposals`. An approved item shows on the memory page,
`/memory`, and its row in the `memory_items` table has the state `active`. A proposal has no row in
that table.

Before you start:

- When the browser has no sign-in since `up` or `attach`, run
  [sign-in-enrol](feature-sign-in-enrol.md) first.
- On `local`, run this journey once per `up`: step 3 checks that the `memory_items` table is empty.
  Before a second pass, run `bun verify up --restart` and `bun verify doctor`, then sign-in-enrol.

On `local`, keep the message and the memory item text below as they are. A message that states the
item's fact would make nixie keep the item at once, with no proposal.

## Journey

1. Record the next commands under this feature. On `preview`, skip the `action script-reply` line:
   the real model decides what to propose.

   ```bash
   bun verify use --feature memory-approval
   bun verify action script-reply --memory 'The user keeps bees on the allotment.' --text 'I will ask you before I remember that.'
   ```

   Expect: `data.replies` is 2: the memory call is one scripted step, and the text reply is the
   other.

2. Send the message. On `preview`, change the message to one that asks nixie to guess a fact about
   you and remember it, such as "Guess which city I grew up in, and remember it.". Skip the
   `conversation turn` line there, and take snapshots of `/` until the reply shows.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'I took the bees some sugar water today.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'I took the bees some sugar water today.' --reply 'I will ask you before I remember that.'
   ```

   Expect: `conversation turn` exits 0.

3. On `preview`, skip this step. On `local`, check that no memory item exists yet:

   ```bash
   bun verify db query "select state from memory_items"
   ```

   Expect: `data.rows` is empty.

4. Open the approvals page:

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: the "Memory" list holds one collapsed item, which shows the item's text and no buttons.
   Note the text.

   On `preview`, the "Memory" list can be empty. Then skip steps 5 and 6, and skip `done`. Report
   the snapshot, and which case it shows:
   - The "Routine" list holds "Run memory.remember (note).": nixie's policy held the model's call as
     an action. An approved action never writes the memory item, so the item never reaches the
     memory page.
   - No list holds an item: the model proposed nothing.

5. Expand the item, then approve it. In the snapshot of step 4, find the line that holds the item's
   text and `[cursor=pointer]`. Pass that line's `ref`, such as `f3e11`, as `<item_ref>`. Each
   snapshot gives new refs.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser click --role button --name 'Save to memory'
   ```

   Expect: both clicks exit 0.

6. Check the memory. On `preview`, skip the `db query` line.

   ```bash
   bun verify db query "select state from memory_items"
   bun verify browser goto /memory
   bun verify browser snapshot
   ```

   Expect: one row in `data.rows`, with `state` `active`, and the item's text on the memory page.

## End state

- The approvals page of step 4 listed the item.
- On `local`, the `db query` of step 6 returns one row, whose `state` is `active`.
- The memory page shows the item's text from step 4: on `local`, "The user keeps bees on the
  allotment.".
