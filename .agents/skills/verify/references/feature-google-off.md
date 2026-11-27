# google-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `google` section has no Google. It offers the model no Gmail, Calendar
or Drive tool, polls no mailbox, and leaves `google` out of the features that `nixie.read` reports.
The web client hides the Connections entry of its menu, and a direct visit to
`/settings/connections` shows the page that says the feature is off in this nixie.

Run this journey on `local` only, on an `up` of its own, because every other Google journey needs
Google on:

- On `local`, `NIXIE_VERIFY_NO_GOOGLE=1 bun verify up` runs a test build of nixie whose config
  leaves out the `google` section.
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

3. Check that nixie wrote no record of a Google connection:

   ```bash
   bun verify db query "select count(*) as connection_records from records where kind like 'connection.%'"
   ```

   Expect: one row, with `connection_records` 0.

## End state

- In step 1, the menu held no Connections entry.
- In step 2, the connections page said that the feature is off in this nixie.
- In step 3, nixie held no `connection.` record.

Once the end state matches, run `bun verify done`. Then run `bun verify up --restart` and
`bun verify doctor`, so the next journey has Google on.
