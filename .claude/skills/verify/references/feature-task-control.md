# task-control

The model can start a task, a separate thread with its own brief. The task's page,
`/tasks/<task ID>`, has Pause and Resume buttons. Pausing a task that waits for work sets its state
to `paused`, and resuming sets it back to `waiting`. Each control writes a record on the task's
thread, so the event log follows the state: `task.paused`, then `task.resumed`.

This journey runs on `local` only: the `task` check reads the harness, and the scripted model starts
the task. Run [sign-in-enrol](feature-sign-in-enrol.md) first, unless the browser is still signed in
from an earlier journey since `up`. Use a task name that no earlier journey since `up` used.

## Journey

1. Record the next commands under this feature, and queue a model turn that starts the task:

   ```bash
   bun verify use --feature task-control
   bun verify action script-reply --text 'I started the tide tables.' --task '{"name":"Tide tables","brief":"Write down the tides.","reply":"Tides noted."}'
   ```

   Expect: `data.replies` is 3: the task start and the conversation's reply, then the task's own
   first reply.

2. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Start a task that writes down the tides.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Start a task that writes down the tides.' --reply 'I started the tide tables.'
   ```

   Expect: `conversation turn` exits 0.

3. Wait until the task has answered its brief, then open its page:

   ```bash
   bun verify task --name 'Tide tables' --state waiting --record task.step_committed
   bun verify browser goto /tasks/<taskID>
   bun verify browser snapshot
   ```

   Use the `taskID` from the `task` command's `data.tasks`. When `task` fails because the last
   record is another, the task's first turn is still running: run it again.

   Expect: the page shows "Waiting", and the group "Controls for Tide tables" holds a Pause button.

4. Pause the task, and check it:

   ```bash
   bun verify browser click --role button --name Pause
   bun verify task --name 'Tide tables' --state paused --record task.paused
   bun verify db query "select state, resume_state from tasks where task_id = '<taskID>'"
   bun verify browser snapshot
   ```

   Expect: `task` exits 0. The row has `state` `paused` and `resume_state` `waiting`. The page shows
   "Paused" and a Resume button.

5. Resume the task, and check it:

   ```bash
   bun verify browser click --role button --name Resume
   bun verify task --name 'Tide tables' --state waiting --record task.resumed
   bun verify db query "select state, resume_state from tasks where task_id = '<taskID>'"
   ```

   Expect: `task` exits 0. The row has `state` `waiting` and `resume_state` `null`.

## End state

- After Pause, the task was `paused` and its last record was `task.paused`.
- After Resume, the task is `waiting` and its last record is `task.resumed`.
