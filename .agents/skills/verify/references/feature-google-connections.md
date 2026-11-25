# google-connections

Contents: [Journey](#journey), [End state](#end-state).

The connections page at `/settings/connections` lists the 6 steps that set up Google, a form for the
OAuth client, a Connect button and the connections. The user registers a client, presses Connect,
consents on Google's page and lands on the connection's page. Forget there revokes the grant and
deletes the connection's keys. The page then shows the erasure, the revocation and the key backups
apart.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. There, the test build reaches Google's endpoints at a fake Google
that the harness serves. The fake grants every scope to one account, `verify@example.test`.
`preview` and `prod` reach the real Google, which needs your own Google Cloud project. On them, skip
this journey and run no `done`. In your reply, list the feature as not verified there.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`, because a deployment registers one client. Before you run it
  again, even after a failed pass, run `bun verify up --restart` and `bun verify doctor`. Then run
  sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature, then open the page:

   ```bash
   bun verify use --feature google-connections
   bun verify browser goto /settings/connections
   bun verify browser snapshot
   ```

   Expect: the heading "Connections" and the text "No account is connected yet". The list "Setup
   steps" holds 6 items: "Create a Google Cloud project", "Turn on the APIs", "Fill in the
   branding", "Publish the app", "Create a web client" and "Connect an account". The button "Connect
   a Google account" is disabled.

2. Register the OAuth client:

   ```bash
   bun verify browser type --role textbox --name 'Client ID' --value 'verify-client.apps.test'
   bun verify browser type --label 'Client secret' --value 'verify-secret-value'
   bun verify browser click --role button --name 'Register the client'
   bun verify browser snapshot --until-text 'Secret fingerprint'
   ```

   Expect: the region "Registered OAuth client" shows a redirect URI that ends in
   `/connections/google/return` and a secret fingerprint. The text `verify-secret-value` appears
   nowhere on the page. The button "Connect a Google account" is enabled.

3. Press Connect. The browser goes to the fake Google, which sends it back to nixie's return route:

   ```bash
   bun verify browser click --role button --name 'Connect a Google account'
   bun verify browser snapshot --until-text 'Scopes granted'
   bun verify db query "select binding, status from connections"
   ```

   Expect: the snapshot's URL starts with `/settings/connections/`, and its heading is
   `verify@example.test`. The status is "Active", the 4 scopes `gmail.modify`, `calendar.events`,
   `calendar.calendarlist.readonly` and `drive.file` are granted, and no "Missing scopes" region
   shows. The query lists one row, with `binding` `enabled` and `status` `active`.

4. Check the list:

   ```bash
   bun verify browser goto /settings/connections
   bun verify browser snapshot --until-text 'Active'
   ```

   Expect: the list "Connections" holds one item, a link named `verify@example.test`, with the text
   "Active".

5. Forget the connection from its page:

   ```bash
   bun verify browser click --role link --name 'verify@example.test'
   bun verify browser click --role button --name 'Forget this connection'
   bun verify browser click --role button --name 'Forget for good'
   bun verify browser snapshot --until-text 'Key backups'
   bun verify db query "select binding, status, refresh_token_sealed is null as no_token, account_sealed is null as no_account from connections"
   ```

   Expect: the region "Forget status" holds 3 lines that start with "Erasure: done", "Revocation:
   confirmed" and "Key backups:". The status is "Forgotten", and the account reads "No account
   kept". The query lists one row: `binding` `removed`, `status` `forgotten`, `no_token` 1 and
   `no_account` 1.

6. Check the list again:

   ```bash
   bun verify browser goto /settings/connections
   bun verify browser snapshot --until-text 'Forgotten'
   bun verify browser screenshot
   ```

   Expect: the list holds one item, a link named "Forgotten connection", with the text "No account
   kept · Forgotten". The screenshot is evidence for the reviewer.

## End state

- Step 1: the page lists the 6 setup steps in order, and Connect stays disabled until a client is
  registered.
- Step 2: the registered client shows its redirect URI and a fingerprint of the secret. The page
  never shows the secret.
- Step 3: the consent comes back through the return route to the connection's page, with the account
  from the ID token, the status "Active" and no missing scopes.
- Step 5: the Forget status shows the erasure and the revocation apart from the key backups. The row
  is `removed` and `forgotten`, and holds neither a refresh token nor an account.
- Step 6: the list marks the connection as forgotten, with no account.
