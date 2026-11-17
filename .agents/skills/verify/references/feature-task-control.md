# task-control

- [Journey](#journey): start a task, then pause and resume it from its page.
- [End state](#end-state): what the task's state and records show after each press.

The model can start a task, which works on a brief apart from the conversation. Each task has its
own thread in the event log, and its own page, `/tasks/<taskID>`, with a Pause button and a Resume
button:

| Press  | `state` in `tasks` | `resume_state` in `tasks`       | Last record on the thread |
| ------ | ------------------ | ------------------------------- | ------------------------- |
| Pause  | `paused`           | `waiting`, the state to restore | `task.paused`             |
| Resume | `waiting`          | `null`                          | `task.resumed`            |

Run this journey on `local` only. It needs a scripted model to start the task, and the `task`
command, which reads the list of tasks from the harness that runs nixie on `local`. `preview` has
neither, so list this feature as not verified there.

Before you start:

- Run [sign-in-enrol](feature-sign-in-enrol.md) first when the browser holds no session since `up`.
- Restart nixie when an earlier attempt since `up` pressed Send in step 2. That press created a task
  named "Tide tables", and the `task` command fails while 2 tasks have that name. Run
  `bun verify up --restart`, `bun verify doctor` and sign-in-enrol, then start again at step 1.

## Journey

1. Record the next commands under this feature, and script the model's 3 replies:
   - the conversation's turn starts the task, from the `--task` JSON;
   - the conversation's turn then replies with `--text`;
   - the task's first turn replies to its brief with the JSON's `reply`.

   ```bash
   bun verify use --feature task-control
   bun verify action script-reply --text 'I started the tide tables.' --task '{"name":"Tide tables","brief":"Write down the tides.","reply":"Tides noted."}'
   ```

   Expect: `data.replies` is the number 3.

2. Send the message. `conversation turn` waits up to 10 s for the message and the reply in the event
   log.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Start a task that writes down the tides.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Start a task that writes down the tides.' --reply 'I started the tide tables.'
   ```

   Expect: `conversation turn` exits 0.

3. Check that the task finished its first turn. The `task` command checks once, with no wait. It
   passes when the task's state matches `--state`, and the kind of its last record matches
   `--record`.

   ```bash
   bun verify task --name 'Tide tables' --state waiting --record task.step_committed
   ```

   Expect: exit 0. In `data.tasks`, the entry whose `name` is "Tide tables" holds the `taskID` for
   the next steps.

   On exit 1, the task can still be in its turn. Run the same command again, up to 5 runs in all.
   After the fifth failed run, skip `done`, and report the entry from `data.tasks`, which holds the
   task's `records` on a failure too.

4. Open the task's page. Put the `taskID` from step 3 in place of `<taskID>`.

   ```bash
   bun verify browser goto /tasks/<taskID>
   bun verify browser snapshot
   ```

   Expect: the page shows "Idle", and the group "Controls for Tide tables" holds a Pause button. The
   page labels a `waiting` task that has nothing to do as "Idle".

5. Pause the task:

   ```bash
   bun verify browser click --role button --name Pause
   ```

   Expect: exit 0.

6. Check the paused task:

   ```bash
   bun verify task --name 'Tide tables' --state paused --record task.paused
   bun verify db query "select state, resume_state from tasks where task_id = '<taskID>'"
   bun verify browser snapshot
   ```

   Expect: `task` exits 0. The one row in `data.rows` has `state` `paused` and `resume_state`
   `waiting`. The page shows "Paused" and a Resume button.

   On exit 1 from `task`, run the same `task` command again, up to 5 runs in all, then run the query
   and the snapshot. After the fifth failed run, skip `done`, and report the entry.

7. Resume the task:

   ```bash
   bun verify browser click --role button --name Resume
   ```

   Expect: exit 0.

8. Check the resumed task:

   ```bash
   bun verify task --name 'Tide tables' --state waiting --record task.resumed
   bun verify db query "select state, resume_state from tasks where task_id = '<taskID>'"
   ```

   Expect: `task` exits 0. The one row in `data.rows` has `state` `waiting`, and `resume_state` is
   JSON `null`. On exit 1, retry `task` as in step 6.

## End state

The feature works when both checks hold:

- After Pause, in step 6: the task is `paused`, its `resume_state` is `waiting`, its last record is
  `task.paused`, and its page shows "Paused".
- After Resume, in step 8: the task is `waiting`, its `resume_state` is `null`, and its last record
  is `task.resumed`.
