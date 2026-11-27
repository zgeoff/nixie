# memory-approval

Contents: [Journey](#journey), [End state](#end-state).

The model can propose a memory item, a fact about the user that nixie keeps. When the user's own
words in the conversation do not state the fact, nixie holds the item as a proposal until the user
approves it on the approvals page, `/proposals`. An approved item shows on the memory page,
`/memory`, and its row in the `memory_items` table has the state `active`. A proposal has no row in
that table.

Once an item is active, a later call that sets a reminder, starts or defines a task, or writes a
skill applies at once and its result lists the active items that match its text, as `related`. The
journey checks that for a reminder, then forgets the item from the memory page. A forget runs on the
erasure runner: `erasure.started` holds the keys to delete, and `erasure.finished` ends the forget
once the keys, the indexes and the sessions are clean.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up`, `attach` and `done`, and the `data` field
of each command's JSON output.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up` or `attach`, run it
  first.
- On `local`, run this journey once per `up`: step 3 checks that the `memory_items` table is empty.
  Before a second pass, run `bun verify up --restart` and `bun verify doctor`, then sign-in-enrol.
  `up --restart` starts nixie on a new, empty database.

On `local`, keep the message and the memory item text below as they are. A message that states the
item's fact would make nixie keep the item at once, with no proposal.

## Journey

1. Record every later command of this journey under this feature. On `preview`, skip the
   `action script-reply` line and its expectation: the real model decides what to propose.

   ```bash
   bun verify use --feature memory-approval
   bun verify action script-reply --memory 'The user keeps bees on the allotment.' --text 'I will ask you before I remember that.'
   ```

   Expect: `data.replies` is 2: the memory call is one scripted step, and the text reply is the
   other.

2. Send the message. On `preview`, change the step:
   - Type a message that asks nixie to guess a fact about you and remember it, such as "Guess which
     city I grew up in, and remember it.".
   - Skip the `conversation turn` line.
   - Take a snapshot of `/` every 10 seconds, for up to 2 minutes, until a new reply from nixie
     shows. Expect: the reply in a snapshot.

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

   On `preview`, the "Memory" list can hold items from earlier passes. Pick the item whose text
   matches the fact you asked for. When the list holds no such item, skip steps 5 and 6, and skip
   `bun verify done`, so the feature records no verdict. In your reply to your caller, paste the
   lines of the snapshot that hold the lists, and say which case they show:
   - The "Routine" list holds "Run memory.remember (note).": nixie's policy held the model's call as
     an action. Leave that action unanswered. An approved action never writes the memory item, so
     the item never reaches the memory page.
   - No list holds an item: the model proposed nothing.

5. Expand the item, then approve it. Take the `ref` from the snapshot of step 4, and take no other
   snapshot before the first click: each snapshot gives every element a new `ref`. In that snapshot,
   find the line that holds the item's text and `[cursor=pointer]`. Pass that line's `ref`, such as
   `f3e11`, as `<item_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser click --role button --name 'Save to memory'
   ```

   Expect: both clicks exit 0.

6. Check the memory. On `preview`, skip the `db query` lines.

   ```bash
   bun verify db query "select state from memory_items"
   bun verify db query "select state, used_by is not null as has_approval from proposals where family = 'memory'"
   bun verify browser goto /memory
   bun verify browser snapshot
   ```

   Expect: one row in `data.rows` of the first query, with `state` `active`, and the item's text on
   the memory page. The second query returns one row, with `state` `approved` and `has_approval` 1:
   the shared proposal row holds the memory proposal's state and names its approval.

7. On `preview`, skip this step and step 8: the real model decides which tools it calls. Set a
   reminder whose words match the approved item. The scripted model sets it, then writes a note
   whose body is the short ID of the memory that the reminder's result lists as `related`. When the
   result lists none, the request fails and no note is written.

   ```bash
   bun verify action script-reply --reminder '{"name":"Check the bees","note":"Check on the bees on the allotment."}' --text 'The reminder is set.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Remind me to check on the bees.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Remind me to check on the bees.' --reply 'The reminder is set.'
   ```

   Expect: `script-reply` shows `data.replies` of 3, and `conversation turn` exits 0.

8. Check that the reminder is set and the note names the related memory.

   ```bash
   bun verify db query "select count(*) as reminders from reminders where state = 'active'"
   bun verify db query "select count(*) as notes from records where kind = 'notebook.note_written'"
   bun verify db query "select short_id from memory_items where state = 'active'"
   ```

   Expect: `reminders` is 1, `notes` is 1, and the one row of the third query holds the short ID
   that the note's body carries. Read the body on the notebook page, `/notebook`.

9. On `preview`, skip this step and step 10: the preview keeps its items. Forget the item from the
   memory page. Take the `ref` of the item's "Forget" button from the first snapshot, and take no
   other snapshot before the first click.

   ```bash
   bun verify browser goto /memory
   bun verify browser snapshot
   bun verify browser click --ref '<forget_ref>'
   bun verify browser snapshot --until-text 'Forget for good'
   bun verify browser click --role button --name 'Forget for good'
   bun verify browser snapshot --until-text '· forgotten'
   ```

   Expect: the second snapshot shows "Forget this item for good? You cannot undo it.". Both clicks
   exit 0. The last snapshot waits for the forgotten item's line to show a "forgotten" date, which
   the page shows only once `erasure.finished` is written. A line that reads "forgetting" means the
   erasure is still open, so step 10 never reads an unfinished forget.

10. Check the erasure states of the forget and the memory page:

    ```bash
    bun verify db query "select state from memory_items"
    bun verify db query "select kind, json_extract(payload, '$.kind') as erased, json_extract(payload, '$.by') as by_whom, json_extract(payload, '$.removedKeys') as removed_keys from records where kind in ('erasure.started', 'erasure.finished') order by sequence"
    bun verify db query "select count(*) as open_forgets from records s where s.kind = 'erasure.started' and not exists (select 1 from records f where f.kind = 'erasure.finished' and json_extract(f.payload, '$.erasureID') = json_extract(s.payload, '$.erasureID'))"
    bun verify browser goto /memory
    bun verify browser snapshot
    ```

    Expect: the first query returns one row with `state` `forgotten`. The second returns 2 rows:
    `erasure.started`, then `erasure.finished`, each with `erased` `memory_item` and `by_whom`
    `user`, and `removed_keys` set on the finished row. The third returns `open_forgets` 0. The
    memory page no longer shows the item's text.

## End state

- The approvals page of step 4 listed the item.
- On `local`, the first `db query` of step 6 returns one row, whose `state` is `active`, and the
  second returns one `proposals` row that is `approved` and names its approval.
- The memory page shows the item's text from step 4: on `local`, "The user keeps bees on the
  allotment.".
- On `local`, the reminder of step 7 is active, and the note of step 8 holds the short ID of the
  approved item: the reminder's result listed it as `related`, and the call applied first.
- On `local`, the forget of step 9 left the item `forgotten` with one finished erasure and no open
  one, and the memory page shows no item.
- On `preview`, when step 4 found no item, the feature has no verdict. Your reply gives the case
  from step 4.
