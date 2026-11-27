# google-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `google` section has no Google, even when it still holds a Google
connection. It offers the model no Gmail, Calendar or Drive tool, polls no mailbox, and leaves
`google` out of the features that `nixie.read` reports. The web client hides the Connections entry
of its menu, and a direct visit to `/settings/connections` shows the page that says the feature is
off in this nixie.

Run this journey on `local` only, on an `up` of its own, because every other Google journey needs
Google on:

- On `local`, `NIXIE_VERIFY_NO_GOOGLE=1 bun verify up` runs a test build of nixie that connects the
  fake Google account, takes the `google` section out of the config, and starts again on the same
  data. The nixie of the journey holds a Google connection and has no Google.
- On `preview`, skip this journey, and list the feature as not verified there in your reply. The
  preview's config holds a `google` section, so its Google is on.

Before you start, run `NIXIE_VERIFY_NO_GOOGLE=1 bun verify up --restart` and `bun verify doctor`,
then [sign-in-enrol](feature-sign-in-enrol.md).

## Journey

1. Record every later command of this journey under this feature, and open the conversation page:

   ```bash
   bun verify use --feature google-off
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   ```

   Expect: all three commands exit 0. The snapshot shows the Send button and, in the menu, no link
   named "Connections".

2. Visit the connections page by its address:

   ```bash
   bun verify browser goto /settings/connections
   bun verify browser snapshot --until-text 'This feature is off in this nixie'
   ```

   Expect: both commands exit 0. The snapshot shows the text that the feature is off, and no button
   named "Connect a Google account".

3. Check the tools that nixie gave the model at its last start. Read only the last `server.started`
   record, because nixie had Google on at the first start of the `up`:

   ```bash
   bun verify db query "with last as (select payload from records where kind = 'server.started' order by sequence desc limit 1) select (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value like 'gmail.%' or t.value like 'calendar.%' or t.value like 'drive.%') as google_tools, (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value = 'task.start') as task_start_tools"
   ```

   Expect: one row, with `google_tools` 0 and `task_start_tools` 1. The second count shows that the
   list holds other tools, so a `google_tools` of 0 does not mean an empty list.

4. Check that the connection is still stored, so the next step meets a connection that a poll could
   read:

   ```bash
   bun verify db query "select count(*) as connection_records from records where kind like 'connection.%'"
   ```

   Expect: one row, with `connection_records` 1 or more.

5. Put a mail in the fake Gmail and move the clock past the poll interval, then count the requests
   that the fake Gmail answered since nixie started, which must be none:

   ```bash
   bun verify action deliver-gmail --from hello@library.example.org --subject 'Your sign-in code'
   bun verify action advance-clock --minutes 3
   bun verify gmail requests --count 0
   ```

   Expect: all three commands exit 0. A Gmail poll that ran would have read the account, and the
   last command would fail with `check-failed`.

## End state

- In step 1, the menu held no Connections entry.
- In step 2, the connections page said that the feature is off in this nixie.
- In step 3, the model's tool list held no `gmail.`, `calendar.` or `drive.` tool.
- In step 4, nixie still held the connection.
- In step 5, the poll interval passed with a mail waiting, and the fake Gmail answered no request.

Once the end state matches, run `bun verify done`. Then run `bun verify up --restart` and
`bun verify doctor`, so the next journey has Google on.
