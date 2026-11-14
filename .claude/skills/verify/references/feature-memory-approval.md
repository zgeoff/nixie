# memory-approval

The model can propose a memory item, a fact about the user that nixie keeps. When the user's own
words in the conversation do not state the fact, nixie holds the item as a proposal until the user
approves it on the proposals page, `/memory/proposals`. An approved item shows on the memory page,
`/memory`, and its row in the `memory_items` table has the state `active`. A proposal has no row in
that table.

Run [sign-in-enrol](feature-sign-in-enrol.md) first, unless the browser is still signed in from an
earlier journey since `up` or `attach`.

On `local`, run this journey on fresh data: before a second pass, run `bun verify up --restart` and
`bun verify doctor`, then sign-in-enrol. Keep the message and the memory item text below as they
are. A message that states the item's fact would make nixie keep the item at once, with no proposal.

## Journey

1. Record the next commands under this feature. On `preview`, skip the `action script-reply` line:
   the real model decides what to propose.

   ```bash
   bun verify use --feature memory-approval
   bun verify action script-reply --memory 'The user keeps bees on the allotment.' --text 'I will ask you before I remember that.'
   ```

   Expect: `data.replies` is 2, one for the proposal and one for the reply.

2. Send the message. On `preview`, type a message that asks nixie to guess a fact about you and
   remember it, such as "Guess which city I grew up in, and remember it.", and skip the
   `conversation turn` line. When the real model proposes nothing, step 4 ends the journey.

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

4. Open the proposals page:

   ```bash
   bun verify browser goto /memory/proposals
   bun verify browser snapshot
   ```

   Expect: one item in the "Pending proposals" list, with an Approve button. Note the item's text.
   On `preview`, when that list is empty, skip the rest and `done`. Report the snapshot, and which
   case it shows:
   - The "Pending actions" list holds "Run memory.remember (note).": nixie's policy held the model's
     call as an action. Approving an action runs nothing yet, so the item never reaches the memory
     page.
   - Neither list holds an item: the model proposed nothing.

5. Approve the proposal. The disabled "Approve selected" button never matches this command.

   ```bash
   bun verify browser click --role button --name Approve
   ```

6. Check the memory. On `preview`, skip the `db query` line.

   ```bash
   bun verify db query "select state from memory_items"
   bun verify browser goto /memory
   bun verify browser snapshot
   ```

   Expect: one row in `data.rows`, with `state` `active`, and the item's text on the memory page.

## End state

- The proposals page of step 4 listed the item.
- On `local`, the `db query` of step 6 returns one row, whose `state` is `active`.
- The memory page shows the item's text from step 4: on `local`, "The user keeps bees on the
  allotment.".
