# coding-session

Contents: [Journey](#journey), [End state](#end-state).

When the model starts a coding task, nixie holds the start until you approve it, because the starter
rule `ask-coding-sessions` makes nixie ask before every `coding.start`. After you approve, nixie
starts one session on the coding gateway, binds the session to a task of its own, and the task waits
for the session's events:

- The model's `task.start` call has the policy name `task.start/atc`. You find it under "Routine" on
  the approvals page, `/proposals`.
- When you approve it, nixie adds an `action.queued` record for `coding.start`, a `task.created`
  record whose `runner` is `atc`, and a `coding.session_bound` record whose `origin` is `started`.
- The `coding_sessions` table holds one row for the session, with `adapter` `atc`.
- The task reads as "Idle" on its page, like any waiting task.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up` and `done`, and the `data` field of each
command's JSON output.

Run this journey on `local` only, on an `up` of its own:

- On `local`, `NIXIE_VERIFY_CODING=1 bun verify up` runs a test build of nixie with a scripted model
  and a double of the coding gateway. On that `up`, the start tool offers only the coding runner, so
  the model can start no sandbox task. Run only sign-in-enrol and then this journey on it.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- Run `NIXIE_VERIFY_CODING=1 bun verify up --restart` and `bun verify doctor`, then
  [sign-in-enrol](feature-sign-in-enrol.md).
- Run this journey once per `up`, because in step 4 nixie must hold exactly one call of
  `task.start/atc`.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn:
   it starts a coding task on `atc`, then replies.

   ```bash
   bun verify use --feature coding-session
   bun verify action script-reply --text 'I asked to start the session.' --coding-task '{"name":"Login fix","brief":"Fix the login test.","repo":{"url":"https://example.net/acme/app.git","ref":"main"}}'
   ```

   Expect: `data.replies` is 2.

2. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Start a coding session on the login test.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Start a coding session on the login test.' --reply 'I asked to start the session.'
   ```

   Expect: `conversation turn` exits 0.

3. Script a text reply for the turn that nixie starts after you approve, or that turn fails:

   ```bash
   bun verify action script-reply --text 'Thanks, I have your answer.'
   ```

   Expect: `data.replies` is 1.

4. Check that nixie holds the start, then open the approvals page:

   ```bash
   bun verify proposals --tool task.start/atc --waiting pending
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: `proposals` exits 0. The "Routine" list holds one collapsed item, which reads "Run
   task.start/atc (coding_start).".

5. Expand the item, then approve it. Take the `ref` from the snapshot of step 4, and take no other
   snapshot before the first click. In that snapshot, find the line that holds "Run task.start/atc
   (coding_start)." and `[cursor=pointer]`, and pass its `ref` as `<item_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser click --role button --name 'Run task.start/atc'
   ```

   Expect: both clicks exit 0.

6. Check the started task. The `task` command checks once, with no wait. On exit 1, run it again, up
   to 5 runs in all, because the task can still be in its first step.

   ```bash
   bun verify task --name 'Login fix' --state waiting --record task.step_committed
   bun verify db query "select adapter, origin from coding_sessions"
   bun verify db query "select json_extract(payload, '$.runner') as runner from records where kind = 'task.created' and json_extract(payload, '$.runner') = 'atc'"
   ```

   Expect: `task` exits 0, and the entry of "Login fix" in `data.tasks` holds the `taskID` and the
   records `coding.session_bound` and `task.step_committed`. The first query returns one row with
   `adapter` `atc` and `origin` `started`. The second returns one row with `runner` `atc`.

7. Open the task's page. Put the `taskID` from step 6 in place of `<taskID>`.

   ```bash
   bun verify browser goto /tasks/<taskID>
   bun verify browser snapshot
   ```

   Expect: the page shows "Idle", and the group "Controls for Login fix".

## End state

- Step 4: nixie held one call of `task.start/atc`.
- Step 6: the task "Login fix" waits, its session is bound with the origin `started`, and the task's
  runner is `atc`.
- Step 7: the task's page shows it as idle, with its controls.
