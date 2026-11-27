# coding-supervision

Contents: [Journey](#journey), [End state](#end-state).

A coding task that nixie started shows on the tasks page in the group "Coding sessions", with a line
that says the session runs outside nixie. The line holds the session's state, which is Running,
Waiting for you, Idle, Ended or Out of reach, and the time of the session's last event. The state
moves on the open page when the session changes, with no reload. A stop of the task also stops the
session that nixie started, and the stop's confirmation says so.

Run this journey on `local` only, on the `up` of the [coding-session](feature-coding-session.md)
journey, straight after that journey's step 6. The task "Login fix" and its session must exist, and
the browser must stay signed in. On `preview`, skip this journey, and list the feature as not
verified there in your reply.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up` and `done`, and the `data` field of each
command's JSON output.

## Journey

1. Record every later command of this journey under this feature, then open the tasks page:

   ```bash
   bun verify use --feature coding-supervision
   bun verify browser goto /tasks
   bun verify browser snapshot
   ```

   Expect: the page holds the group "Coding sessions" and the line "These sessions run in another
   program, outside nixie.". The entry "Login fix" reads "Coding session, outside nixie: started by
   nixie", and its state reads "Running" or "Idle".

2. Tell the coding gateway that the session waits for you. Run no `browser goto` after this, so the
   next snapshot shows what the live stream moved.

   ```bash
   bun verify action set-session-state --state needs_you
   bun verify browser snapshot
   ```

   Expect: `data.sessions` is 1. nixie reads the session's state about once a second, so the first
   snapshot can still show the old state. Take another snapshot, up to 5 in all, until the entry
   "Login fix" reads "Waiting for you". After the fifth snapshot that still shows the old state,
   skip `done`, and report the last snapshot.

3. Tell the gateway that the agent finished its turn:

   ```bash
   bun verify action set-session-state --state done
   bun verify browser snapshot
   ```

   Expect: the entry reads "Idle" and shows "Last event" with a time. Take up to 5 snapshots, as in
   step 2.

4. Press Stop in the group "Controls for Login fix", and read the confirmation:

   ```bash
   bun verify browser click --role button --name Stop
   bun verify browser snapshot
   ```

   Expect: the confirmation holds the line "This also stops its coding session.".

5. Confirm the stop, then check the task and its session:

   ```bash
   bun verify browser click --role button --name 'Stop the task'
   bun verify task --name 'Login fix' --state stopped --record task.stopped
   bun verify db query "select unbound_at is not null as released from coding_sessions"
   bun verify browser snapshot
   ```

   Expect: `task` exits 0, and the one row in `data.rows` has `released` 1. The page still lists
   "Login fix" under "Coding sessions", reads "Stopped" and offers Close and no Restart. On exit 1
   from `task`, run it again, up to 5 runs in all.

## End state

- Step 1: "Login fix" shows in the group "Coding sessions", marked as a coding session outside
  nixie.
- Steps 2 and 3: the shown state moved to "Waiting for you" and then to "Idle", with no page load.
- Step 5: the task is `stopped`, its session row has an `unbound_at`, and the page offers only
  Close.
