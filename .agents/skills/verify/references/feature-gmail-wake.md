# gmail-wake

Contents: [Journey](#journey), [End state](#end-state).

With a connected Google account, nixie polls its Gmail for new mail. A new mail wakes the
conversation only when a wake rule that the model set matches it. A mail that no rule matches leaves
nothing behind.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. There, the test build reaches the fake Google that the harness
serves. `preview` and `prod` reach the real Google. On them, skip this journey and run no `done`. In
your reply, list the feature as not verified there.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Before you run it again, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command under this feature, and connect the account as in step 1 of
   [gmail-tools](feature-gmail-tools.md). Then move the clock past the poll interval, so the first
   poll reads the account's place in its history:

   ```bash
   bun verify use --feature gmail-wake
   bun verify action advance-clock --minutes 3
   ```

2. Script the model's next turn: it sets a wake rule for mail from the library's domain, then
   replies. Send the message.

   ```bash
   bun verify action script-reply --text 'I will watch for the mail.' --gmail-watch '{"from":"@library.example.org"}'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Watch my Gmail for the library.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Watch my Gmail for the library.' --reply 'I will watch for the mail.'
   ```

   Expect: `data.replies` is 2 for the script, and `conversation turn` exits 0. The `gmail.wake_set`
   call is queued and no starter rule allows it, so it waits as a card on the approvals page. Open
   `/proposals`, expand the one item and approve it with its button, as in steps 5 and 6 of
   [gmail-tools](feature-gmail-tools.md). Then run
   `bun verify proposals --tool gmail.wake_set --waiting none`, which exits 0.

3. Check the rule:

   ```bash
   bun verify db query "select json_extract(match, '$.from') as from_match, mailbox from wake_rules"
   ```

   Expect: one row, with `from_match` `["@library.example.org"]` and a `mailbox` that starts with
   `gmail:`.

4. Deliver a mail that no rule matches, and let the account poll. Read the poll's cursor before and
   after, so you know the poll committed before you count anything:

   ```bash
   bun verify db query "select cursor from trigger_sources where source_id = 'gmail'"
   bun verify action deliver-gmail --from news@school.example.org --subject 'Term dates'
   bun verify action advance-clock --minutes 3
   bun verify db query "select cursor from trigger_sources where source_id = 'gmail'"
   ```

   Expect: the `polledAt` in the cursor of the second query is later than in the first. When it is
   the same, wait a few seconds and run the second query again. Count only once it has moved: a poll
   that has not committed leaves every count at 0 whatever the code does. Then:

   ```bash
   bun verify db query "select count(*) as arrivals from records where kind = 'trigger.mail_arrived'"
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   ```

   Expect: `arrivals` is 0 and `wakes` is 0.

5. Script the turn that the wake starts, deliver the library's mail, and let the account poll:

   ```bash
   bun verify action script-reply --text 'I saw the library mail.'
   bun verify action deliver-gmail --from hello@library.example.org --subject 'Your sign-in code'
   bun verify action advance-clock --minutes 3
   bun verify model received --text 'Your sign-in code'
   ```

   Expect: `data.requests` is 1 or more for the last command.

6. Check the wake:

   ```bash
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   bun verify model input --contains 'Your sign-in code'
   ```

   Expect: `wakes` is 1, and the model's input holds the mail's subject.

## End state

- Step 3: the rule is on the Gmail mailbox of the connection, for the library's domain.
- Step 4: the poll committed, and the mail that no rule matches left no arrival and no wake.
- Step 6: the matching mail woke the conversation once, and the model received its subject.
