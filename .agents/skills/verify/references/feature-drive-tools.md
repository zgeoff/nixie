# drive-tools

Contents: [Journey](#journey), [End state](#end-state).

With a connected Google account, the assistant searches and reads the files that the owner picked
for nixie, and the files that nixie made, with the `drive` tools. Each result that holds a file's
name or text counts as outside content. A new file reaches no one: it is private to the account, so
nixie runs the create without a card.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. There, the test build reaches Google's endpoints at a fake Google
that the harness serves. The fake holds one Google Doc, "Trip plan". It has no file picker: Google's
own pop-up cannot run in a local journey, so the choice of files is not part of this journey.
`preview` and `prod` reach the real Google. On them, skip this journey and run no `done`. In your
reply, list the feature as not verified there.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`, because a deployment registers one client. Before you run it
  again, even after a failed pass, run `bun verify up --restart` and `bun verify doctor`. Then run
  sign-in-enrol. Restart between this journey and [calendar-tools](feature-calendar-tools.md).

## Journey

1. Record every later command of this journey under this feature. Then register the OAuth client and
   connect the account, as in steps 1 to 3 of [google-connections](feature-google-connections.md):

   ```bash
   bun verify use --feature drive-tools
   bun verify browser goto /settings/connections
   bun verify browser type --role textbox --name 'Client ID' --value 'verify-client.apps.test'
   bun verify browser type --label 'Client secret' --value 'verify-secret-value'
   bun verify browser click --role button --name 'Register the client'
   bun verify browser snapshot --until-text 'Secret fingerprint'
   bun verify browser click --role button --name 'Connect a Google account'
   bun verify browser snapshot --until-text 'Scopes granted'
   ```

   Expect: the snapshot's heading is `verify@example.test`, with the status "Active".

2. Script the model's next turn: it searches the files for "plan", creates a text file, and then
   answers.

   ```bash
   bun verify action script-reply --text 'The file is made.' --drive-create '{"query":"plan","name":"Packing list","text":"Passport and charger."}'
   ```

   Expect: `data.replies` is 3.

3. Send the message:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Make a packing list file.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Make a packing list file.' --reply 'The file is made.'
   ```

   Expect: `conversation turn` exits 0.

4. Check that the create ran once, with no card, and that the file is in the fake Drive:

   ```bash
   bun verify proposals --tool drive.create --waiting none
   bun verify db query "select json_extract(payload, '$.status') as status from records where kind = 'action.outcome' and json_extract(payload, '$.tool') = 'drive.create'"
   bun verify drive files --name 'Packing list' --text 'Passport and charger.'
   ```

   Expect: `proposals` exits 0. The query returns one row with `status` `done`. `drive files` exits
   0: the fake Drive holds exactly one file named "Packing list", with that text. It fails with
   `check-failed` for no file, for a double create and for other text.

## End state

- Step 4: the create ran with no card, and its action is done.
- Step 4: the fake Drive holds one "Packing list" with the text the model gave, beside the seeded
  "Trip plan".
