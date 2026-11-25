# mail-wake

Contents: [Journey](#journey), [End state](#end-state).

The assistant has a mailbox of its own. A mail wakes the conversation only when a wake rule that the
model set matches it, and the model reads the mail with its mail tools. Each tool result that holds
a mail's sender, subject or text counts as outside content, and the model reads its links by number.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up` and `done`, and the `data` field of each
command's JSON output.

Run this journey on `local` only, on an `up` of its own:

- On `local`, `NIXIE_VERIFY_MAIL=1 bun verify up` runs a test build of nixie with a scripted model
  and a mailbox on a host in memory. `bun verify action deliver-mail` puts mail in that mailbox.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- Run `NIXIE_VERIFY_MAIL=1 bun verify up --restart` and `bun verify doctor`, then
  [sign-in-enrol](feature-sign-in-enrol.md).
- Run this journey once per `up`, because the counts in steps 4 and 6 start from an empty mailbox.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn:
   it sets a wake rule for mail from the library's domain, then replies.

   ```bash
   bun verify use --feature mail-wake
   bun verify action script-reply --text 'I will watch for the mail.' --mail-watch '{"from":"@library.example.org"}'
   ```

   Expect: `data.replies` is 2.

2. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Watch for a mail from the library.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Watch for a mail from the library.' --reply 'I will watch for the mail.'
   ```

   Expect: `conversation turn` exits 0.

3. Check the rule:

   ```bash
   bun verify db query "select json_extract(match, '$.from') as from_match, window_ms from wake_rules"
   ```

   Expect: one row, with `from_match` `["@library.example.org"]` and `window_ms` 60000.

4. Deliver a mail that no rule matches, and check that it wakes nothing. The mail reaches the
   mailbox within a second, so run the first query again when it counts 0.

   ```bash
   bun verify action deliver-mail --from news@school.example.org --subject 'Term dates' --text 'Term starts on Monday.'
   bun verify db query "select count(*) as stored from mail_messages"
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   ```

   Expect: `stored` is 1 and `wakes` is 0.

5. Script the turn that the next wake starts: the model lists the unread mail from the library,
   opens the newest, then replies. Then deliver the library's reset mail, which holds its link in an
   HTML body, and wait for the model to receive the opened mail.

   ```bash
   bun verify action script-reply --text 'I read the sign-in mail.' --mail-read '{"from":"@library.example.org"}'
   bun verify action deliver-mail --from hello@library.example.org --subject 'Reset your password' --text '' --html '<p>Tap <a href="https://library.example.org/reset?token=t0k3n">Reset password</a>.</p>'
   bun verify model received --text 'library.example.org/reset'
   ```

   Expect: `data.replies` is 3 for the first command, and `data.requests` is 1 or more for the last.

6. Check the wake and the outside content:

   ```bash
   bun verify model input --contains 'library.example.org/reset'
   bun verify db query "select number, url from web_fetch_links"
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   bun verify db query "select content_source from records where kind = 'tool_result' order by sequence desc limit 2"
   bun verify db query "select direction, unread from mail_messages order by received_at"
   ```

   Expect: the model's input holds the link in the text of the opened mail as a numbered tag, such
   as `[L1 · library.example.org/reset]`, and never the URL with its token. `web_fetch_links` has
   one row, number 1, with the full URL, which `web_fetch` opens by that ID. `wakes` is 1. Both
   `content_source` values are `untrusted`. The first mail is still unread, and the second is read.

## End state

- Step 3: the wake rule holds the library's domain, with a window of 1 minute.
- Step 4: the mail that no rule matches is stored and unread, and wakes nothing.
- Step 6: the matching mail woke the conversation once, the model read it with its link as a
  numbered ID, and the results that held the mail are marked untrusted.
