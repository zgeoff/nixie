# policy-proposal

Contents: [Journey](#journey), [End state](#end-state).

When an [ask rule](../../../../docs/architecture/policy/decision-point.md#asks) matches a tool call
the model makes, nixie holds the call until you answer it:

- The call's `tool_result` record has the outcome `queued`, and its `actionID` is `null`: nothing
  ran.
- The approvals page, `/proposals`, lists each held call under its risk group, such as "Routine" for
  the `memory.export` call that this journey makes.
- The `proposals` table holds one row for the call, with `family` `action` and `state` `pending`.
  The table also holds other kinds of proposal, such as rule changes, so step 7 reads only the rows
  whose `family` is `action`.

When you approve the call, its row's `state` becomes `approved`, and nixie adds a
`proposals.settled` record. nixie starts no model turn for that record and shows the model no
message. nixie then runs the call, adds an `action.outcome` record, and starts one model turn for
it. In that turn the model reads the outcome and the time you approved the call. The export tool
never exports: it tells the model that the user exports memory from the memory view, so the call's
`action.outcome` has the status `failed` and the reason `refused`. That is the outcome this journey
expects, and the turn after it commits like any other. When someone declines a call, nixie starts a
model turn that shows the model the decline and its reason. The test build starts with the
[starter rules](../../../../deploy/compose/definitions/rules/starter.yaml), the rules file that the
Compose recipe ships. Its rule `ask-exports` holds every call whose effect is `export`, such as
`memory.export`.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up` and `done`, and the `data` field of each
command's JSON output.

Run this journey on `local` only:

- On `local`, `up` runs a test build of nixie with a scripted model, which makes the export call.
- The `proposals` command reads the test build's list of held calls, which `preview` lacks.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`: in steps 3, 5 and 7, nixie must hold no call but this pass's
  export call. Before a second pass, run `bun verify up --restart` and `bun verify doctor`, then
  sign-in-enrol. `up --restart` starts nixie on a new, empty database.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn:
   it calls `memory.export`, then replies.

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

3. Check that nixie holds the call and did not run it. `proposals --waiting pending` checks once,
   with no wait, and exits 0 when nixie holds exactly one call of the tool.

   ```bash
   bun verify proposals --tool memory.export --waiting pending
   bun verify db query "select json_extract(payload, '$.outcome') as outcome, json_extract(payload, '$.actionID') as action from records where kind = 'tool_result' and thread = 'conversation' order by sequence"
   ```

   Expect: `proposals` exits 0. The last row of `data.rows` is the export call's result, with
   `outcome` `queued` and `action` `null`. Earlier rows are from earlier journeys' tool calls.

4. Script a text reply for the turn that the call's outcome starts, or that turn fails. The later
   steps never check its reply.

   ```bash
   bun verify action script-reply --text 'Thanks, I have your answer.'
   ```

   Expect: `data.replies` is 1.

5. Open the approvals page:

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: the "Routine" list holds one collapsed item, which reads "Run memory.export (export).",
   with no buttons.

6. Expand the item, then approve the call. Take the `ref` from the snapshot of step 5, and take no
   other snapshot before the first click: each snapshot gives every element a new `ref`. In that
   snapshot, find the line that holds "Run memory.export (export)." and `[cursor=pointer]`. Pass
   that line's `ref`, such as `f3e11`, as `<item_ref>`. The approve button is named "Run
   memory.export".

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser click --role button --name 'Run memory.export'
   ```

   Expect: both clicks exit 0.

7. Check the answer. `proposals --waiting none` checks once, with no wait, and exits 0 when nixie
   holds no call of the tool.

   ```bash
   bun verify proposals --tool memory.export --waiting none
   bun verify db query "select state from proposals where family = 'action'"
   bun verify db query "select json_extract(payload, '$.outcome') as outcome, json_extract(payload, '$.family') as family from records where kind = 'proposals.settled' and json_extract(payload, '$.family') = 'action'"
   ```

   Expect: `proposals` exits 0. The first query returns one row with `state` `approved`. The second
   returns one row with `outcome` `approved` and `family` `action`.

8. Check the turn that the approval started. It reads the call's outcome, and it must commit with no
   step error. The turn takes a few seconds:

   ```bash
   bun verify db query "select kind from records where kind in ('task.step_committed', 'task.step_errored') and sequence > (select sequence from records where kind = 'proposals.settled' and json_extract(payload, '$.family') = 'action') order by sequence"
   bun verify db query "select json_extract(payload, '$.status') as status, json_extract(payload, '$.reason') as reason from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'memory.export'"
   ```

   Expect: the first query returns one row, with `kind` `task.step_committed`. The second returns
   one row, with `status` `failed` and `reason` `refused`. When the first query returns no row, run
   it again, up to 5 runs in all. A row with `task.step_errored` fails the journey: skip `done`, and
   report the record.

## End state

- Step 3: nixie held one call of `memory.export`. Its result had the outcome `queued` and no action.
- Step 7: no call is held. The call's row in `proposals` and its `proposals.settled` record both say
  `approved`.
- Step 8: the turn after the approval ended in `task.step_committed`, with no `task.step_errored`.
  The call's `action.outcome` says `failed` with the reason `refused`, because the export tool sends
  the user to the memory view.
