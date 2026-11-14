# policy-proposal

When an ask rule matches a tool call the model makes, nixie holds the call until you answer it:

- The call's `tool_result` record has the outcome `queued`, and its `actionID` is `null`: nothing
  ran.
- The proposals page, `/memory/proposals`, lists each held call under "Pending actions".
- The `proposals` table holds one row for the call, with `family` `action` and `state` `pending`.
  The table also holds other kinds of proposal, such as rule changes.

When you approve the call, its row's `state` becomes `approved`, and nixie adds a
`policy.action_answered` record. nixie then starts a new model turn to tell the model your answer.
The starter rules are on by default. Their rule `ask-exports` holds every call whose effect is
`export`, such as `memory.export`.

This journey runs on `local` only:

- On `local`, a harness runs nixie with a scripted model, which makes the export call.
- The `proposals` command reads the harness's list of held calls.

Before you start:

- When the browser has no sign-in since `up`, run [sign-in-enrol](feature-sign-in-enrol.md) first.
- Steps 3, 5 and 6 expect the export call of this pass to be the only held call since `up`. Before a
  second pass, run `bun verify up --restart` and `bun verify doctor`, then sign-in-enrol.

## Journey

1. Record the next commands under this feature. Then script the model's next turn: it calls
   `memory.export`, then replies.

   ```bash
   bun verify use --feature policy-proposal
   bun verify action script-reply --export --text 'The export waits for your approval.'
   ```

   Expect: `data.replies` is 2: the export call is one scripted step, and the text reply is the
   other.

2. Send the message. `conversation turn` waits up to 10 s for the message and the reply in the event
   log.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Export my memory, please.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Export my memory, please.' --reply 'The export waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

3. Check that nixie holds the call and did not run it. `proposals --waiting pending` passes when
   exactly one call of the tool is held.

   ```bash
   bun verify proposals --tool memory.export --waiting pending
   bun verify db query "select json_extract(payload, '$.outcome') as outcome, json_extract(payload, '$.actionID') as action from records where kind = 'tool_result' and thread = 'conversation' order by sequence"
   ```

   Expect: `proposals` exits 0. The last row of `data.rows` is the export call's result, with
   `outcome` `queued` and `action` `null`. Earlier rows are from earlier journeys' tool calls.

4. Script the model's text for the turn that your answer starts. Without it, that turn fails.

   ```bash
   bun verify action script-reply --text 'Thanks, I have your answer.'
   ```

   Expect: `data.replies` is 1.

5. Approve the call on the proposals page:

   ```bash
   bun verify browser goto /memory/proposals
   bun verify browser snapshot
   bun verify browser click --role button --name 'Approve action'
   ```

   Expect: the snapshot's "Pending actions" list holds one item, which reads "Run memory.export
   (export).".

6. Check the answer. `proposals --waiting none` passes when no call of the tool is held.

   ```bash
   bun verify proposals --tool memory.export --waiting none
   bun verify db query "select state from proposals where family = 'action'"
   bun verify db query "select json_extract(payload, '$.answer') as answer from records where kind = 'policy.action_answered'"
   ```

   Expect: `proposals` exits 0. The first query returns one row with `state` `approved`. The second
   returns one row with `answer` `approved`.

## End state

- Step 3: nixie held one call of `memory.export`. Its result had the outcome `queued` and no action.
- Step 6: no call is held. The call's row in `proposals` and its answer record both say `approved`.
