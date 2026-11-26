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

- Start from an `up` that no journey but sign-in-enrol has used. A deployment registers only one
  OAuth client, and the counts below start at 0. After any other journey, run
  `bun verify up --restart` and `bun verify doctor` first.
- Run [sign-in-enrol](feature-sign-in-enrol.md) first, after each `up`.

## Journey

1. Record every later command under this feature. Then register the OAuth client, connect the
   account, and move the clock past the poll interval, so the first poll reads the account's place
   in its history:

   ```bash
   bun verify use --feature gmail-wake
   bun verify browser goto /settings/connections
   bun verify browser type --role textbox --name 'Client ID' --value 'verify-client.apps.test'
   bun verify browser type --label 'Client secret' --value 'verify-secret-value'
   bun verify browser click --role button --name 'Register the client'
   bun verify browser snapshot --until-text 'Secret fingerprint'
   bun verify browser click --role button --name 'Connect a Google account'
   bun verify browser snapshot --until-text 'Scopes granted'
   bun verify action advance-clock --minutes 3
   ```

   Expect: each command exits 0.

2. Script the model's next turn to set a wake rule for mail from the library's domain and then
   reply. Then send the message.

   ```bash
   bun verify action script-reply --text 'I will watch for the mail.' --gmail-watch '{"from":"@library.example.org"}'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Watch my Gmail for the library.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Watch my Gmail for the library.' --reply 'I will watch for the mail.'
   ```

   Expect: `data.replies` is 2 for the script, and `conversation turn` exits 0. No starter rule
   allows the `gmail.wake_set` call, so it waits on the approvals page, under Routine.

3. Script the turn that the rule's outcome starts, then approve the rule:

   ```bash
   bun verify action script-reply --text 'The rule is set.'
   bun verify browser goto /proposals
   bun verify browser click --role button --name 'Approve all routine'
   bun verify proposals --tool gmail.wake_set --waiting none
   ```

   Expect: each command exits 0, and `data.proposals` of the last is empty.

4. Check the rule:

   ```bash
   bun verify db query "select json_extract(match, '$.from') as from_match, mailbox from wake_rules"
   ```

   Expect: one row, with `from_match` `["@library.example.org"]` and a `mailbox` that starts with
   `gmail:`.

5. Deliver a mail that no rule matches, and let the account poll. Read the poll's cursor before and
   after, so you know the poll committed before you count anything:

   ```bash
   bun verify db query "select cursor from trigger_sources where source_id = 'gmail'"
   bun verify action deliver-gmail --from news@school.example.org --subject 'Term dates'
   bun verify action advance-clock --minutes 3
   bun verify db query "select cursor from trigger_sources where source_id = 'gmail'"
   ```

   Expect: the `polledAt` in the cursor of the second query is later than in the first. When it is
   the same, run the `advance-clock` command and the second query again. Count only once it has
   moved: a poll that has not committed leaves every count at 0 whatever the code does. Then:

   ```bash
   bun verify db query "select count(*) as arrivals from records where kind = 'trigger.mail_arrived'"
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   ```

   Expect: `arrivals` is 0 and `wakes` is 0.

6. Script the turn that the wake starts, deliver the library's mail, and let the account poll:

   ```bash
   bun verify action script-reply --text 'I saw the library mail.'
   bun verify action deliver-gmail --from hello@library.example.org --subject 'Your sign-in code'
   bun verify action advance-clock --minutes 3
   bun verify model received --text 'Your sign-in code'
   ```

   Expect: `data.requests` is 1 or more for the last command.

7. Check the wake:

   ```bash
   bun verify db query "select count(*) as wakes from records where kind = 'trigger.mail_woke'"
   bun verify model input --contains 'Your sign-in code'
   ```

   Expect: `wakes` is 1, and the model's input holds the mail's subject.

## End state

- Step 4: the rule is on the Gmail mailbox of the connection, for the library's domain.
- Step 5: the poll committed, and the mail that no rule matches left no arrival and no wake.
- Step 7: the matching mail woke the conversation once, and the model received its subject.
