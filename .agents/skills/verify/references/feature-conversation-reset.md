# conversation-reset

Contents: [Journey](#journey), [End state](#end-state).

A reset of the conversation forgets every message on the conversation thread. It runs through the
erasure runner: nixie writes `erasure.started`, deletes the keys of the thread's records, then
writes `erasure.finished` and the `log_reset` record in one transaction. The server restarts, and
the next turn starts with no history. The memory items, the other threads and the signed-in browsers
stay.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only, and after every other journey, because the reset restarts the
server. On `preview`, skip this journey and run no `done`. In your reply, list the feature as not
verified on `preview`.

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

3. Wait for the server to start again, then check what the log holds and what the page shows:

   ```bash
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   bun verify db query "select kind, json_extract(payload, '$.kind') as target, json_extract(payload, '$.removedKeys') as removed from records where kind in ('erasure.started', 'erasure.finished', 'log_reset') and (kind = 'log_reset' or json_extract(payload, '$.kind') = 'conversation') order by sequence"
   ```

   Expect: the query lists `erasure.started`, `erasure.finished` and then `log_reset`, and `removed`
   on `erasure.finished` is 1 or more. The snapshot shows neither "When does the ferry leave?" nor
   "The ferry leaves at six."

## End state

- Step 1: the conversation thread holds at least 2 records that still have a key.
- Step 2: the host command exits 0 and prints the count of keys removed and a "Key backups" line.
- Step 3: the log holds one finished erasure of the conversation, followed by `log_reset`, and the
  page shows neither message. A record keeps its `key_id` after the reset: the key is gone from the
  key store.
