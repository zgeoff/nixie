# task-control

- [Journey](#journey): start a task, then pause and resume it from its page.
- [End state](#end-state): what the task's state and records show after each press.

The model can start a task, which works on a brief apart from the conversation. Each task has its
own thread in the event log, and its own page, `/tasks/<taskID>`, with a Pause button and a Resume
button:

| Press  | `state` in `tasks` | `resume_state` in `tasks`       | Record added to the thread |
| ------ | ------------------ | ------------------------------- | -------------------------- |
| Pause  | `paused`           | `waiting`, the state to restore | `task.paused`              |
| Resume | `waiting`          | `null`                          | `task.resumed`             |

This journey runs on `local` only:

- On `local`, a harness runs nixie with a scripted model, which starts the task.
- The `task` command reads the harness's list of tasks, with the kind of each record on each task's
  thread.

Before you start:

- When the browser has no sign-in since `up`, run [sign-in-enrol](feature-sign-in-enrol.md) first.
- The `task` command fails when two tasks have the name "Tide tables". So when an earlier attempt
  since `up` reached step 2, run `bun verify up --restart` and `bun verify doctor`, then
  sign-in-enrol.

## Journey

1. Record the next commands under this feature. Then script the model: the conversation's turn
   starts the task, then replies, and the task's first turn replies to its brief.

   ```bash
   bun verify use --feature task-control
   bun verify action script-reply --text 'I started the tide tables.' --task '{"name":"Tide tables","brief":"Write down the tides.","reply":"Tides noted."}'
   ```

   Expect: `data.replies` is 3: one scripted step each for the task start, the conversation's text
   and the task's text.

2. Send the message. `conversation turn` waits up to 10 s for the message and the reply in the event
   log.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Start a task that writes down the tides.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Start a task that writes down the tides.' --reply 'I started the tide tables.'
   ```

   Expect: `conversation turn` exits 0.

3. Check that the task finished its first turn. The `task` command checks once, with no wait.

   ```bash
   bun verify task --name 'Tide tables' --state waiting --record task.step_committed
   ```

   Expect: exit 0. In `data.tasks`, the entry whose `name` is "Tide tables" holds the `taskID` for
   the next steps.

   On exit 1, read that entry's `records`, which `data.tasks` holds on failure too. When its last
   item is another kind than `task.step_committed`, the task's first turn is not over yet: repeat
   the command, up to five times in all. After the fifth failure, skip `done`, and report the entry.

4. Open the task's page. Put the `taskID` from step 3 in place of `<taskID>`.

   ```bash
   bun verify browser goto /tasks/<taskID>
   bun verify browser snapshot
   ```

   Expect: the page shows "Waiting", and the group "Controls for Tide tables" holds a Pause button.

5. Pause the task:

   ```bash
   bun verify browser click --role button --name Pause
   ```

6. Check the paused task:

   ```bash
   bun verify task --name 'Tide tables' --state paused --record task.paused
   bun verify db query "select state, resume_state from tasks where task_id = '<taskID>'"
   bun verify browser snapshot
   ```

   Expect: `task` exits 0. The row has `state` `paused` and `resume_state` `waiting`. The page shows
   "Paused" and a Resume button. On exit 1, repeat `task` as step 3 says.

7. Resume the task:

   ```bash
   bun verify browser click --role button --name Resume
   ```

8. Check the resumed task:

   ```bash
   bun verify task --name 'Tide tables' --state waiting --record task.resumed
   bun verify db query "select state, resume_state from tasks where task_id = '<taskID>'"
   ```

   Expect: `task` exits 0. The row has `state` `waiting`, and `resume_state` is JSON `null`. On exit
   1, repeat `task` as step 3 says.

## End state

The feature works when both checks hold:

- After Pause, in step 6, the task is `paused`, its last record is `task.paused`, and its page shows
  "Paused".
- After Resume, in step 8, the task is `waiting` again, and its last record is `task.resumed`.
