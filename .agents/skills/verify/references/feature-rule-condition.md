# rule-condition

Contents: [Journey](#journey), [End state](#end-state).

A [rule can hold a condition](../../../../docs/architecture/policy/rules.md): a `cel` expression
with a note. The rule matches a call only when its fixed fields match and the condition holds. The
approval card shows the rule's sentence, the note, the condition in words and the expression behind
a control.

Run this journey on `local` only, once per `up`, after [sign-in-enrol](feature-sign-in-enrol.md).
The test build's scripted model proposes a mandate whose one allow rule covers `memory.export` when
`args.format == "json"`. The mandate stays pending until you answer it, so this journey checks the
card, and the match and the miss stay with the policy and integration tests.

## Journey

1. Record every later command under this feature, then script the model: it proposes the mandate,
   then replies.

   ```bash
   bun verify use --feature rule-condition
   bun verify action script-reply --rule-condition '{"title":"Exports today","cel":"args.format == \"json\"","note":"Json exports only."}' --text 'The mandate waits for your approval.'
   ```

   Expect: `data.replies` is 2.

2. Send the message.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Let me export in json today.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Let me export in json today.' --reply 'The mandate waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

3. Open the approvals page and read the card.

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: the card shows "Your note" or "nixie's note" with "Json exports only.", the words
   "`args.format` is "json"", and a "Show the expression" control that holds
   `args.format == "json"`.

4. Check the stored proposal.

   ```bash
   bun verify db query "select state from proposals where family = 'rule_change'"
   ```

   Expect: one row with `state` `pending`.

## End state

- Step 3: the card shows the note, the condition in words and the expression, labelled by whose note
  it is.
- Step 4: the mandate proposal is pending. The conformance of a match and a miss is held by the
  policy and integration tests, not by this journey.
