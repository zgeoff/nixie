# Connect a Google account

Make an OAuth client in your own Google Cloud project, register it in nixie, and connect a Google
account from Settings → Connections. nixie keeps the account's refresh token sealed in its database,
and reads Gmail, Calendar and Drive live. The
[Google connections](../architecture/connectors/google-connections.md) doc covers how consent,
refresh and Forget work.

Settings → Connections shows the same 6 steps as this guide, with the same titles, and fills in your
page's address where a step names it.

## Before you start

- A Google account that can create a Google Cloud project.
- A web address for nixie that starts with `https://` and has a domain name, such as
  `https://nixie.example.org`. Google checks it against the OAuth client exactly.
- A home page and a privacy policy page on a domain you control. Google asks for both when you
  publish the app.
- A browser signed in to nixie, open on that address.

## Create a Google Cloud project

Use one project for this nixie alone. A revocation reaches every client of a project, so another
nixie in the same project would lose its grant when you forget a connection here.

1. Open the [new project page](https://console.cloud.google.com/projectcreate) and create a project.
2. Note the project number on the project's dashboard. The Drive picker needs it.

## Turn on the APIs

1. Open each API in the library for the project: the
   [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com), the
   [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com),
   the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) and
   the [Google Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com).
2. Enable each one.

Expect: all 4 show as enabled under APIs & Services. A scope whose API stays off shows in nixie as
missing, with the reason "its API is off in your Google Cloud project".

## Fill in the branding

1. Open [Branding](https://console.cloud.google.com/auth/branding) in the Google Auth Platform.
2. Give an app name and your email.
3. Give the address of your home page and of your privacy policy page. Publishing needs both.

## Publish the app

1. Open [Audience](https://console.cloud.google.com/auth/audience).
2. Choose External.
3. Publish the app to production, with no test users.

An app in testing status ends each consent after 7 days, so nixie would ask you to consent again
each week.

## Create a web client

1. Open [Clients](https://console.cloud.google.com/auth/clients) and create a client of type Web
   application.
2. Add your nixie address plus `/connections/google/return` as the only authorised redirect URI,
   such as `https://nixie.example.org/connections/google/return`.
3. Add your nixie address as the authorised JavaScript origin, such as `https://nixie.example.org`.
4. Copy the client ID and the client secret.
5. For the Drive picker, open [Credentials](https://console.cloud.google.com/apis/credentials) and
   create an API key. Restrict it to the Google Picker API and to 2 websites: your nixie address and
   `https://docs.google.com/*`.
6. Open Settings → Connections in nixie. In the step "Create a web client", enter the client ID and
   the client secret. Enter the API key and the project number if you made them.
7. Select Register the client.

Expect: the page shows the redirect URI, the origin, a fingerprint of the secret and the picker
values. nixie keeps the secret sealed and never shows it again. Select Remove the client to register
another one. nixie refuses while a connection that is not forgotten uses the client.

## Connect an account

1. In the step "Connect an account", select Connect a Google account.
2. On Google's page, choose the account and allow every scope it asks for.
3. Expect: Google sends you back to nixie, on the page of the new connection. Its status is Active.

When you untick a scope on Google's page, the connection still works. Its page lists each missing
scope with the tools it holds back, and a button to ask Google again. The conversation never shows
that notice.

## The unverified-app warning

An account that does not own the project first sees "Google hasn't verified this app". Select
Advanced, then continue to the app. The warning stays while the app is not verified, and a grant to
an unverified app in production keeps working.

## Forget a connection

1. Open the connection from Settings → Connections.
2. Select Forget this connection, then Forget for good.

nixie revokes the grant at Google and deletes the connection's keys, so its tokens are unreadable at
once. The page then shows 3 lines:

- Erasure: whether nixie deleted the keys.
- Revocation: whether Google ended the grant. A revocation of "unknown" or "refused" leaves the
  grant at Google, so end it by hand as the next section says.
- Key backups: whether a published backup set no longer holds the keys. A backup set that nixie made
  before the forget stays readable until the backup job prunes the key repository.

Using the account again takes a fresh consent.

## Revoke a grant by hand

After a Forget whose revocation reads "refused" or "unknown", open your Google Account's third-party
access page, find the app by the name you gave it, and remove its access.
