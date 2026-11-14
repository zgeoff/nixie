# policy-proposal

nixie's policy rules decide each tool call the model makes. An ask rule holds the call: nixie
records the call with the outcome `queued`, runs nothing, and lists the held call on the proposals
page, `/memory/proposals`, under "Actions waiting for you". Approving it records your answer. The
starter rule `ask-exports` asks before any call whose effect is `export`, such as `memory.export`.

This journey runs on `local` only: the `proposals` check reads the harness, and the scripted model
makes the call. Run [sign-in-enrol](feature-sign-in-enrol.md) first, unless the browser is still
signed in from an earlier journey since `up`.

## Journey

1. Record the next commands under this feature, and queue a model turn that asks to export memory:

   ```bash
   bun verify use --feature policy-proposal
   bun verify action script-reply --export --text 'The export waits for your approval.'
   ```

   Expect: `data.replies` is 2, one for the export call and one for the reply.

2. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Export my memory, please.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Export my memory, please.' --reply 'The export waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

3. Check that the call waits and did not run:

   ```bash
   bun verify proposals --tool memory.export --waiting pending
   bun verify db query "select json_extract(payload, '$.outcome') as outcome, json_extract(payload, '$.actionID') as action from records where kind = 'tool_result' and thread = 'conversation'"
   ```

   Expect: `proposals` exits 0. The last row of `data.rows` has `outcome` `queued` and `action`
   `null`: nixie queued no action for the call.

4. Queue the reply to the turn your answer wakes, then approve the call on the proposals page:

   ```bash
   bun verify action script-reply --text 'Thanks, I have your answer.'
   bun verify browser goto /memory/proposals
   bun verify browser snapshot
   bun verify browser click --role button --name 'Approve action'
   ```

   Expect: before the click, the snapshot's "Pending actions" list holds one item, which reads "Run
   memory.export (export).".

5. Check the outcome:

   ```bash
   bun verify proposals --tool memory.export --waiting none
   bun verify db query "select state from proposals where family = 'action'"
   bun verify db query "select json_extract(payload, '$.answer') as answer from records where kind = 'policy.action_answered'"
   ```

   Expect: `proposals` exits 0. Each query returns one row, with `state` `approved` and `answer`
   `approved`.

## End state

- Before the approval, the call waited with the outcome `queued`, and nixie queued no action for it.
- After the approval, no call waits, and the proposal's state and the recorded answer are both
  `approved`.
