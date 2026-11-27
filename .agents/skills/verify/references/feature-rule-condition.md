# rule-condition

Contents: [Journey](#journey), [End state](#end-state).

A [rule can hold a condition](../../../../docs/architecture/policy/rules.md): a `cel` expression
with a note. The rule matches a call only when its fixed fields match and the condition holds. The
approval card shows the rule's sentence, the note, the condition in words and the expression behind
a control.

Run this journey on `local` only, once per `up`, after [sign-in-enrol](feature-sign-in-enrol.md).
The test build's scripted model proposes a mandate whose one allow rule covers `memory.export` under
a condition. The starter rule `ask-exports` holds every `memory.export` call, so a call that the
rule covers runs, and a call that it does not cover waits for an answer. `memory.export` takes no
argument, so both conditions read the time. The first condition is never true and the second always
is.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Before a second pass, run `bun verify up --restart` and
  `bun verify doctor`, then sign-in-enrol.

## Journey

1. Record every later command under this feature, then script the model: it proposes a mandate whose
   condition is never true, then replies.

   ```bash
   bun verify use --feature rule-condition
   bun verify action script-reply --rule-condition '{"title":"Exports before 2000","cel":"now.getFullYear(\"UTC\") < 2000","note":"Only for exports before the year 2000."}' --text 'The mandate waits for your approval.'
   ```

   Expect: `data.replies` is 2.

2. Send the message.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Let me export, but only before 2000.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Let me export, but only before 2000.' --reply 'The mandate waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

3. Open the approvals page and read the card.

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: the card shows "nixie's note:" with "Only for exports before the year 2000.", the words
   "the year in UTC is before 2000", and a "Show the expression" control that holds
   `now.getFullYear("UTC") < 2000`. They sit under the rule they belong to.

4. Expand the item, then approve it with the passkey. Take the `ref` from the snapshot of step 3,
   and take no other snapshot before the first click: each snapshot gives every element a new `ref`.
   In that snapshot, find the line that holds the mandate's title and `[cursor=pointer]`. Pass that
   line's `ref` as `<item_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser click --role button --name 'Start the mandate'
   bun verify db query "select state from proposals where family = 'rule_change'"
   ```

   Expect: both clicks exit 0, and the query returns one row with `state` `approved`.

5. Make a call that the condition does not cover. The scripted model calls `memory.export`, then
   replies.

   ```bash
   bun verify action script-reply --export --text 'The export waits for your approval.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Export my memory, please.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Export my memory, please.' --reply 'The export waits for your approval.'
   bun verify proposals --tool memory.export --waiting pending
   ```

   Expect: `proposals` exits 0. nixie holds the call, because the mandate's rule did not match.

6. Answer the held call, so none stands when the next call arrives. Script the reply for the turn
   that the answer starts, then open the approvals page.

   ```bash
   bun verify action script-reply --text 'Thanks, I have your answer.'
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: the "Routine" list holds one collapsed item, "Run memory.export (export).". Click it by
   its `ref` from this snapshot, then click the button named "Run memory.export", then run
   `bun verify proposals --tool memory.export --waiting none`. Expect: the clicks and the command
   exit 0.

7. Script a second mandate whose condition is always true, and send the message.

   ```bash
   bun verify action script-reply --rule-condition '{"title":"Exports after 2000","cel":"now.getFullYear(\"UTC\") > 2000","note":"Only for exports after the year 2000."}' --text 'The second mandate waits for your approval.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Let me export after 2000.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Let me export after 2000.' --reply 'The second mandate waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

8. Approve the second mandate as in steps 3 and 4, then check both mandates.

   ```bash
   bun verify db query "select state from proposals where family = 'rule_change' order by created_at"
   ```

   Expect: two rows, each with `state` `approved`.

9. Make a call that the second condition covers.

   ```bash
   bun verify action script-reply --export --text 'The export ran.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Export my memory again.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Export my memory again.' --reply 'The export ran.'
   bun verify proposals --tool memory.export --waiting none
   ```

   Expect: `proposals` exits 0. nixie holds no call, because the second mandate's rule matched and
   the export ran.

## End state

- Step 3: the card shows the note, the condition in words and the expression, each under its own
  rule and labelled by whose note it is.
- Step 4: the first mandate is approved.
- Step 5: nixie held the call that the first condition did not cover.
- Step 9: the call that the second condition covers ran with no hold.
