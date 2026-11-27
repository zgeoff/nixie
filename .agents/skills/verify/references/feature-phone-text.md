# phone-text

Contents: [Journey](#journey), [End state](#end-state).

The assistant has a phone number of its own. A text wakes the conversation only when a wake rule
that the model set matches it, and the model reads the text with its phone tools. Each tool result
that holds a text's sender or body counts as outside content. A text the model sends waits in the
action queue.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up` and `done`, and the `data` field of each
command's JSON output.

Run this journey on `local` only, on an `up` of its own:

- On `local`, `NIXIE_VERIFY_PHONE=1 bun verify up` runs a test build of nixie with a scripted model
  and a phone on a provider in memory, which sends no real text. `bun verify action deliver-text`
  puts a text on that phone.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- Run `NIXIE_VERIFY_PHONE=1 bun verify up --restart` and `bun verify doctor`, then
  [sign-in-enrol](feature-sign-in-enrol.md).
- Run this journey once per `up`, because the counts in steps 4 and 6 start from an empty phone.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn:
   it sets a wake rule for texts from one number, then replies.

   ```bash
   bun verify use --feature phone-text
   bun verify action script-reply --text 'I will watch for the text.' --phone-watch '{"from":"+61422222222"}'
   ```

   Expect: `data.replies` is 2.

2. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Watch for a text from the library.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Watch for a text from the library.' --reply 'I will watch for the text.'
   ```

   Expect: `conversation turn` exits 0.

3. Check the rule:

   ```bash
   bun verify db query "select json_extract(match, '$.from') as from_match, window_ms from wake_rules"
   ```

   Expect: one row, with `window_ms` 60000 and `from_match` `["+61422222222"]`.

4. Deliver a text that no rule matches, and move the clock past the poll interval so the phone
   polls, then check that the text is stored and wakes nothing. When `stored` is 0, run the
   `advance-clock` command and the first query again.

   ```bash
   bun verify action deliver-text --from +61433333333 --body 'Your parcel is at the depot.'
   bun verify action advance-clock --minutes 1
   bun verify db query "select count(*) as stored from phone_texts"
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   ```

   Expect: `stored` is 1 and `wakes` is 0.

5. Script the turn that the next wake starts: the model lists the texts from the library's number,
   opens the newest, queues a reply text, then replies. Then deliver the library's text, move the
   clock, and wait until the model has received the text and the reply text waits for approval.

   ```bash
   bun verify action script-reply --text 'I read the text and answered it.' --phone-read '{"from":"+61422222222"}' --phone-send '{"to":"+61422222222","body":"Thanks, I will be there."}'
   bun verify action deliver-text --from +61422222222 --body 'Your code is 481516.'
   bun verify action advance-clock --minutes 1
   bun verify model received --text '481516'
   bun verify proposals --tool phone.send --waiting pending --wait-ms 30000
   ```

   Expect: `data.replies` is 4 for the first command, `data.requests` is 1 or more for the fourth,
   and the last command exits 0. The fourth command shows only that the wake reached the model,
   because the wake holds the code. Step 6 checks that the read returned it. The last command waits
   until the turn has queued the reply text, so step 6 reads the finished turn.

6. Check the wake, the read's result, the outside content and the held text:

   ```bash
   bun verify model received --text '{\"from\":\"+61422222222\",\"body\":\"Your code is 481516.\"'
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   bun verify db query "select json_extract(called.payload, '$.tool') as tool, json_extract(result.payload, '$.outcome') as outcome, result.content_source from records as called join records as result on result.kind = 'tool_result' and json_extract(result.payload, '$.callID') = json_extract(called.payload, '$.callID') where called.kind = 'tool_called' order by called.sequence"
   bun verify db query "select json_extract(payload, '$.tool') as tool from records where kind = 'policy.action_proposed' order by sequence"
   ```

   Expect: the first command exits 0 with `data.requests` 1 or more. Each model request holds a tool
   result as JSON text, with its quotes escaped. Each text in a `phone.list` result starts with its
   ID, and the wake writes no JSON, so only the read's result can match the first command. The
   command fails when the read returns another body. `wakes` is 1. Among the rows of the second
   query, `phone.list`, `phone.read` and `phone.send` come in that order. The `outcome` of
   `phone.list` and `phone.read` is `result`, and their `content_source` is `untrusted`. A read of
   an unknown text ID would fail this check. The third query lists `phone.send`, because the reply
   text waits for the user's approval. It never reaches a provider.

## End state

- Step 3: the wake rule holds the library's number, with a window of 1 minute.
- Step 4: the text that no rule matches is stored and wakes nothing.
- Step 6: the matching text woke the conversation once, the model listed and read it with results
  that succeeded and are marked untrusted, the read returned the text's body, and its reply text
  waits for the user's approval.
