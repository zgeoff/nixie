# gmail-tools

Contents: [Journey](#journey), [End state](#end-state).

With a connected Google account, the assistant searches and reads its mail with the `gmail` tools.
Each result that holds a mail's words counts as outside content. A reply takes its recipients from
the mail it answers, and the send passes the decision point like any other: a recipient with no
permission holds the call on a card, and the mail goes out once you approve. The mail carries the
action's ID in its `Message-ID` and in no other header.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. There, the test build reaches Google's endpoints at a fake Google
that the harness serves. The fake holds one mail from `Sam Lee <sam@example.org>`, subject "Q3
numbers", whose `Reply-To` is `reports@example.org`, so the reply goes to an address with no
permission. `preview` and `prod` reach the real Google. On them, skip this journey and run no
`done`. In your reply, list the feature as not verified there.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`, because a deployment registers one client and the card of step 5
  must be the only held call. Before you run it again, even after a failed pass, run
  `bun verify up --restart` and `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature. Then register the OAuth client and
   connect the account, as steps 1 to 3 of [google-connections](feature-google-connections.md) do:

   ```bash
   bun verify use --feature gmail-tools
   bun verify browser goto /settings/connections
   bun verify browser type --role textbox --name 'Client ID' --value 'verify-client.apps.test'
   bun verify browser type --label 'Client secret' --value 'verify-secret-value'
   bun verify browser click --role button --name 'Register the client'
   bun verify browser snapshot --until-text 'Secret fingerprint'
   bun verify browser click --role button --name 'Connect a Google account'
   bun verify browser snapshot --until-text 'Scopes granted'
   ```

   Expect: the snapshot's heading is `verify@example.test`, with the status "Active".

2. Script the model's next turn: it searches the mail for "numbers", opens the first mail, replies
   to it, and then answers.

   ```bash
   bun verify action script-reply --text 'The reply waits for your approval.' --gmail-reply '{"query":"numbers","text":"Thanks, I will look at the sheet."}'
   ```

   Expect: `data.replies` is 4.

3. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Answer the mail about the numbers.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Answer the mail about the numbers.' --reply 'The reply waits for your approval.'
   ```

   Expect: `conversation turn` exits 0.

4. Check the calls that the model made. The reply call's result is `queued`, with no action.

   ```bash
   bun verify db query "select json_extract(payload, '$.outcome') as outcome from records where kind = 'tool_result' and thread = 'conversation' order by sequence"
   bun verify proposals --tool gmail.reply --waiting pending
   ```

   Expect: the last 3 rows of `data.rows` have `outcome` `result`, `result` and `queued`: the
   search, the read and the reply. `proposals` exits 0.

5. Script a text reply for the turn that the call's outcome starts, then open the approvals page:

   ```bash
   bun verify action script-reply --text 'The reply is sent.'
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: one collapsed item, which reads
   `Reply to reports@example.org from verify@example.test: "Re: Q3 numbers"`, with no buttons.

6. Expand the item, check its card, and approve it. Take the `ref` from the snapshot of step 5, and
   take no other snapshot before the first click. Pass the `ref` of the line that holds the item's
   text and `[cursor=pointer]` as `<item_ref>`.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --role button --name 'Send reply'
   ```

   Expect: the card shows the fields `from` `verify@example.test`, `to` `reports@example.org`,
   `subject` "Re: Q3 numbers" and `text`, the text of the reply. The approve button reads "Send
   reply". Both clicks exit 0.

7. Check that the mail went out once:

   ```bash
   bun verify proposals --tool gmail.reply --waiting none
   bun verify db query "select state from proposals where family = 'action'"
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'gmail.reply'"
   ```

   Expect: `proposals` exits 0. The first query returns one row with `state` `approved`. The second
   returns one row with `status` `done`.

## End state

- Step 4: the model searched, read and replied. The reply was held, with no action.
- Step 6: the card shows the whole text of the reply and its recipient, the `Reply-To` address of
  the mail.
- Step 7: the reply is approved and its action is done.
