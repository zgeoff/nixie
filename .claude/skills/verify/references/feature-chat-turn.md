# chat-turn

The user types a message into the conversation page and presses Send. nixie records the message,
runs a turn of the model, records the reply, and shows the reply under the message.

Run [sign-in-enrol](feature-sign-in-enrol.md) first, unless the browser is still signed in from an
earlier journey since `up` or `attach`. `up --restart` starts a browser with no sign-in.

On `local`, a scripted model answers in place of the real one. Queue its reply before you press
Send: with no reply queued, it fails the turn, and the reply never shows. When that happens, start
again at step 1.

## Journey

1. Record the next commands under this feature. On `preview`, skip the `action script-reply` line:
   the real model writes the reply.

   ```bash
   bun verify use --feature chat-turn
   bun verify action script-reply --text 'The heron left the pond at dawn.'
   ```

2. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Where did the heron go?'
   bun verify browser click --role button --name Send
   ```

3. On `preview`, skip this step. On `local`, wait for nixie to record the reply:

   ```bash
   bun verify conversation turn --message 'Where did the heron go?' --reply 'The heron left the pond at dawn.'
   ```

   Expect: exit 0. It waits up to 10 s for the message's record and a later reply's record, then
   fails with `check-failed`.

4. Read the page:

   ```bash
   bun verify browser snapshot
   ```

   On `preview`, take a snapshot every 5 s, for up to 60 s. When no reply shows by then, skip
   `done`, and report the missing reply with the last snapshot.

## End state

- On `local`, `conversation turn` exited 0.
- The snapshot's "Conversation" list ends with the message after "You", then the reply after
  "nixie": on `local`, "The heron left the pond at dawn.". A group with the turn's details can sit
  between them.
