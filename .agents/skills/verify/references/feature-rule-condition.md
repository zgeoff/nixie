# rule-condition

Contents: [Journey](#journey), [End state](#end-state).

A [rule can hold a condition](../../../../docs/architecture/policy/rules.md): a `cel` expression
with a note. The rule matches a call only when its fixed fields match and the condition holds. The
approval card shows the rule's sentence, the note, the condition in words and the expression behind
a control.

Run this journey on `local` only, once per `up`, after [sign-in-enrol](feature-sign-in-enrol.md).
The test build's scripted model proposes a mandate whose one allow rule covers `memory.remember`
under a condition on its `subject` argument. A memory item that the user's own words do not state
waits for approval unless an allow rule covers the write, and the starter rules hold no rule for
memory writes, so a write that the condition does not cover waits, and a write that it covers is
kept at once. The scripted call leaves `subject` out, so the subject is `owner`. The first condition
is never true and the second always is.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`: step 5 checks that the `memory_items` table is empty. Before a
  second pass, run `bun verify up --restart` and `bun verify doctor`, then sign-in-enrol.

## Journey

1. Record every later command under this feature, then script the model: it proposes a mandate whose
   condition is never true, then replies.

   ```bash
   bun verify use --feature rule-condition
   bun verify action script-reply --rule-condition '{"title":"Shared facts","cel":"args.subject == \"shared\"","note":"Only for facts about shared things."}' --text 'The mandate waits for your approval.'
   ```

   Expect: `data.replies` is 2.

2. Send the message.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Let me remember shared facts without asking.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Let me remember shared facts without asking.' --reply 'The mandate waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

3. Open the approvals page and read the card.

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: the "Always asks" list holds "Allow memory.remember, until 1970-01-01T14:00:00.000Z, when
   its condition holds." Expand it to see the card, which shows "nixie's note:" with "Only for facts
   about shared things.", "The condition:" with "`args.subject` is "shared"", and a "Show the
   expression" control that holds `args.subject == "shared"`. They sit under the rule they belong
   to. To expand the item, click the line that holds the rule's sentence and `[cursor=pointer]` by
   its `ref`.

4. Approve the mandate. The approvals page asks for a passkey, which a journey cannot give, so the
   action answers with the exemption that a host answer has.

   ```bash
   bun verify action approve-held-mandate
   bun verify db query "select state from proposals where family = 'rule_change'"
   ```

   Expect: the action exits 0 with `data.approved` 1, and the query returns one row with `state`
   `approved`.

5. Make a call that the condition does not cover. The scripted model remembers a fact about the
   user, then replies. The message does not state the fact.

   ```bash
   bun verify action script-reply --memory 'The user keeps bees on the allotment.' --text 'I will ask before I remember that.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'I took the bees some sugar water today.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'I took the bees some sugar water today.' --reply 'I will ask before I remember that.'
   bun verify db query "select state from memory_items"
   bun verify db query "select state from proposals where family = 'memory'"
   ```

   Expect: `conversation turn` exits 0. The first query returns no row, and the second returns one
   row with `state` `pending`: the mandate's rule did not match, so nixie held the item.

6. Script a second mandate whose condition is always true, and send the message.

   ```bash
   bun verify action script-reply --rule-condition '{"title":"Owner facts","cel":"args.subject == \"owner\"","note":"Only for facts about the user."}' --text 'The second mandate waits for your approval.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Let me remember facts about me without asking.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Let me remember facts about me without asking.' --reply 'The second mandate waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

7. Approve the second mandate, then check both mandates.

   ```bash
   bun verify action approve-held-mandate
   bun verify db query "select state from proposals where family = 'rule_change' order by created_at"
   ```

   Expect: the action exits 0, and the query returns two rows, each with `state` `approved`.

8. Make a call that the second condition covers.

   ```bash
   bun verify action script-reply --memory 'The user keeps hens on the allotment.' --text 'I remembered that.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'I fed the hens this morning.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'I fed the hens this morning.' --reply 'I remembered that.'
   bun verify db query "select state from memory_items"
   bun verify db query "select state from proposals where family = 'memory'"
   ```

   Expect: `conversation turn` exits 0. The first query returns one row with `state` `active`, and
   the second still returns only the one `pending` row of step 5: the second mandate's rule matched,
   so nixie kept the item with no hold.

## End state

- Step 3: the card shows the note, the condition in words and the expression, each under its own
  rule and labelled by whose note it is.
- Step 4: the first mandate is approved.
- Step 5: nixie held the item that the first condition did not cover.
- Step 8: the item that the second condition covers is active, and nixie added no hold.
