# conversation-reset

Contents: [Journey](#journey), [End state](#end-state).

A reset of the conversation forgets every message on the conversation thread. It runs through the
erasure runner: nixie writes `erasure.started`, deletes the keys of the thread's records, then
writes `erasure.finished` and the `log_reset` record in one transaction. The server restarts, and
the next turn starts with no history. The memory items, the other threads and the signed-in browsers
stay.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only, and after every other journey, because the reset stops the server.
On `preview`, skip this journey and run no `done`. In your reply, list the feature as not verified
on `preview`.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Before you run it again, even after a failed pass, run
  `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature. Then send a message, and count the
   records the reset will forget:

   ```bash
   bun verify use --feature conversation-reset
   bun verify action script-reply --text 'The ferry leaves at six.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'When does the ferry leave?'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'When does the ferry leave?' --reply 'The ferry leaves at six.'
   bun verify db query "select count(*) as readable from records where thread = 'conversation' and key_id is not null"
   ```

   Expect: `conversation turn` exits 0, and `readable` is 2 or more.

2. Reset the conversation from the host:

   ```bash
   bun verify action reset-conversations-from-host
   ```

   Expect: `data.printed` starts with "nixie removed" and holds a line that starts with "Key
   backups".

3. Check that the server stopped for its restart:

   ```bash
   bun verify status
   ```

   Expect: `data.status` is `crashed`. The reset ends the server with exit code 0 so that a
   supervisor starts it again, and the `local` target has none. The target cannot read the database
   after this step, so a later `db query` or `done` fails with `not-running`. Skip `done`, and list
   the feature in your reply with the `status` output. The tests of the reset check the log and the
   page after the restart.

## End state

- Step 1: the conversation thread holds at least 2 records that still have a key.
- Step 2: the host command exits 0 and prints the count of keys removed and a "Key backups" line.
- Step 3: the server has stopped, and the target reads `crashed`.
