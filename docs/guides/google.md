# Connect a Google account

Make an OAuth client in your own Google Cloud project, register it in nixie, and connect a Google
account from Settings → Connections. nixie keeps the account's refresh token sealed in its database.
Once you connect an account, the model can use the
[Gmail tools](../architecture/connectors/gmail-tools.md) to search, read and label your mail, write
drafts and send mail. It can also wake the conversation or a task when new mail matches a rule it
sets. With the [Calendar and Drive tools](../architecture/connectors/calendar-drive-tools.md) it can
read and change your events and the Drive files you choose. To learn how consent, refresh and Forget
work, read the [Google connections](../architecture/connectors/google-connections.md) doc.

Settings → Connections shows the same 6 steps as this guide, from "Create a Google Cloud project" to
"Connect an account", with your nixie address filled in where a step needs it.

## Before you start

- A Google account that can create a Google Cloud project.
- A web address for nixie that starts with `https://` and has a domain name, such as
  `https://nixie.example.org`. Google checks it against the OAuth client exactly.
- A home page and a privacy policy page on a domain you control. Google asks for both when you
  publish the app.
- A browser signed in to nixie, open on that address.
- A `google: {}` section in nixie's config. With no `google` section, nixie has no Google, and
  Settings → Connections says the feature is off. Set `google.gmail.poll_interval` in that section
  to change how often nixie polls your mail.

## Create a Google Cloud project

Use one project for this nixie alone. A revocation reaches every client of a project, so another
nixie in the same project would lose its grant when you forget a connection here.

1. Open the [new project page](https://console.cloud.google.com/projectcreate) and create a project.
2. When you want the Drive picker, note the project number on the project's dashboard.

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
5. When you want the Drive picker, open
   [Credentials](https://console.cloud.google.com/apis/credentials) and create an API key. Restrict
   it to the Google Picker API and to 2 websites: your nixie address and
   `https://docs.google.com/*`.
6. Open Settings → Connections in nixie. In the step "Create a web client", enter the client ID and
   the client secret. When you made the API key, enter it and the project number too.
7. Select Register the client.

Expect: the page shows the redirect URI, the origin, a fingerprint of the secret and the picker
values. nixie keeps the secret sealed and never shows it again. Select Remove the client to register
another one. nixie refuses while a connection that is not forgotten uses the client.

## Connect an account

1. In the step "Connect an account", select Connect a Google account.
2. On Google's page, choose the account and allow every scope it asks for.

Expect: Google sends you back to nixie, on the page of the new connection. Its status is Active.

The setup ends here. Come back to this guide when you want to forget the connection.

When you untick a scope on Google's page, the connection still works. Its page lists each missing
scope, and a button to ask Google again. The conversation never shows that notice.

## What the assistant does with your mail

- nixie searches and reads your mail without asking you. It asks Gmail at each call and keeps no
  copy of your mail beyond what a call returned. The one exception is the sender and subject of a
  mail that matches a wake rule, described below.
- nixie labels mail and writes drafts without asking you, because a starter rule allows writes to a
  service. When you add a rule that asks first, nixie asks you. A draft stays in your account for
  you to open.
- Before nixie sends mail to an address you haven't allowed, it waits for your answer on a card that
  shows the account, each recipient, the subject and the whole text. The sender of a mail counts as
  allowed for a reply to that mail, so such a reply needs no card.
- When nixie can't tell whether a send went through, it waits 5 minutes, then looks for the mail in
  your Sent folder. When it finds the mail, the send counts as done. Otherwise nixie shows you the
  send on a card, and doesn't send it again until you answer.
- nixie polls your account for new mail every 2 minutes by default, and keeps no record of a mail
  that no wake rule matches. The model sets a wake rule with `gmail.wake_set`, and nixie asks you
  first unless a rule of yours allows it. A mail that matches wakes the conversation or a task, and
  nixie keeps only its sender and subject, until you forget the connection.
- When nixie sends a mail, it also sets a wake rule for a reply in that thread, for 7 days by
  default. The card shows when that rule expires.
- A mail nixie sends carries no header with nixie's name in it.

## What the assistant does with your calendar and Drive

- nixie reads your calendars and events without asking you, and asks Google at each call.
- nixie adds, changes and cancels an event that has no guest without asking you, because a starter
  rule allows writes to a service. Google emails no one for these.
- Before nixie invites, changes or cancels an event with guests, or answers an invitation, it asks
  you on a card that shows the event and each guest, unless your policy already allows the
  destinations, such as the organizer of an event you answer. Google emails the guests only after
  you approve or the policy allows it. nixie never changes an event that someone else organizes,
  apart from your answer to its invitation.
- nixie sees only the Drive files that you choose and the files it makes. To choose files, select
  Choose Drive files on a connection's page and pick them in Google's window. The button needs the
  picker key and the project number from your client. The page lists each file that nixie cannot
  see, which is usually a file chosen under another Google account.
- nixie creates a Drive file in your My Drive, shared with no one. It replaces the content of a file
  it can see only when no one else can read the file.
- When nixie can't tell whether an event or file change went through, it waits 5 minutes, then looks
  for it. A change to an event with guests that it can't find goes to you on a card, and nixie
  doesn't send it again until you answer.

## The unverified-app warning

When you connect an account that does not own the project, Google first shows "Google hasn't
verified this app". Select Advanced, then continue to the app. The warning stays while the app is
not verified. A grant to an unverified app in production keeps working.

## Forget a connection

1. Open the connection from Settings → Connections.
2. Select Forget this connection, then Forget for good.

nixie revokes the grant at Google and ends the connection's wake rules. It erases the sender and
subject it kept for each mail, including in the conversation's history and in logged requests. It
deletes the connection's keys, so the tokens in the database become unreadable at once. The page
then shows 3 lines:

- Erasure: whether nixie deleted the keys.
- Revocation: whether Google ended the grant. After "refused", Google still holds the grant. After
  "unknown", nixie can't tell whether Google still holds it. In both cases, end it by hand with the
  steps in [Revoke a grant by hand](#revoke-a-grant-by-hand).
- Key backups: whether a published backup set no longer holds the keys. A backup set that nixie made
  before the forget stays readable until the backup job prunes the key repository.

To use the account again, consent again.

## Revoke a grant by hand

After a Forget whose revocation reads "refused" or "unknown", open your Google Account's third-party
access page, find the app by the name you gave it, and remove its access.

## What a change to this guide must keep true

Change this guide only together with the code that makes these facts true, and keep the matching
steps in Settings → Connections the same.

- nixie's address starts with `https://`, has a domain name and matches the OAuth client exactly,
  because Google checks it.
- The only authorised redirect URI is the nixie address plus `/connections/google/return`.
- The app is published to production, because testing status ends each consent after 7 days.
- One Google Cloud project serves one nixie, because a revocation reaches every client of a project.
- All 4 APIs are on, or the scope shows as missing.
- Remove the client is refused while a connection that is not forgotten uses it.
- Reads need no card. A send to an address you haven't allowed, and a Calendar change with guests or
  an answer to an invitation that your policy doesn't allow, wait for your answer on a card.
- nixie never changes an event that someone else organizes, apart from your answer to its
  invitation. It replaces a Drive file's content only when no one else can read the file.
- After a send or change whose outcome is unclear, nixie waits 5 minutes and looks for it. A change
  to an event with guests that it can't find goes to you on a card and isn't sent again until you
  answer.
- The poll interval is 2 minutes and the wake rule after a send lasts 7 days, both by default.
- Forget revokes the grant, ends the wake rules, erases the kept sender and subject, deletes the
  keys, and reports Erasure, Revocation and Key backups.
