# Calendar and Drive tools

The Google connector holds 10 `calendar.*` tools and 4 `drive.*` tools beside the
[Gmail tools](gmail-tools.md). They share the Gmail tools' rules for connections, item IDs, effects,
cards and untrusted words, so this page covers only what Calendar and Drive add. For the consent and
the scopes, see [Google connections](google-connections.md).

## The tools

| Tool                                | Effect  | Runs   | Scope                            | If the outcome is unknown, the check |
| ----------------------------------- | ------- | ------ | -------------------------------- | ------------------------------------ |
| `calendar.list_calendars`           | `read`  | direct | `calendar.calendarlist.readonly` | none                                 |
| `calendar.list_events`              | `read`  | direct | `calendar.events`                | none                                 |
| `calendar.read_event`               | `read`  | direct | `calendar.events`                | none                                 |
| `calendar.create_event`             | `write` | queued | `calendar.events`                | `calendar.find_change`, then retries |
| `calendar.create_event_with_guests` | `send`  | queued | `calendar.events`                | `calendar.find_change`, then asks    |
| `calendar.change_event`             | `write` | queued | `calendar.events`                | `calendar.find_change`, then retries |
| `calendar.change_event_with_guests` | `send`  | queued | `calendar.events`                | `calendar.find_change`, then asks    |
| `calendar.cancel_event`             | `write` | queued | `calendar.events`                | `calendar.find_change`, then retries |
| `calendar.cancel_event_with_guests` | `send`  | queued | `calendar.events`                | `calendar.find_change`, then asks    |
| `calendar.respond`                  | `send`  | queued | `calendar.events`                | `calendar.find_change`, then asks    |
| `drive.search`                      | `read`  | direct | `drive.file`                     | none                                 |
| `drive.read`                        | `read`  | direct | `drive.file`                     | none                                 |
| `drive.create`                      | `write` | queued | `drive.file`                     | `drive.find_change`, then retries    |
| `drive.change`                      | `write` | queued | `drive.file`                     | `drive.find_change`, then retries    |

Each check is read-only, runs only from the action queue, and trusts a negative answer only after
the check's wait has passed. A write that a check does not find runs again, because it reaches no
one else. A send that a check does not find goes to you on a card and runs again only after you
answer, because Google may have emailed the guests.

`buildGoogleActions` builds the Gmail, Calendar and Drive actions together, and the `google_tools`
part holds them. Every Calendar and Drive tool is one entry of the connector's `actions`, so the
tool filter and the notice about missing scopes cover them.

## Items

- An event ID is the connection's short ID, a dot and Google's event ID. An event of a calendar
  other than `primary` adds `@` and the calendar's ID. A Drive file ID is the connection's short ID,
  a dot and Drive's file ID.
- `calendar.list_calendars` and `calendar.list_events` answer one page, and `next` goes back as
  `after` for the next.
- Each tool takes a `calendar` argument that defaults to `primary`. Without the scope
  `calendar.calendarlist.readonly`, the model gives `primary` or a calendar ID it knows.
- A time is RFC 3339 with an offset, or a date for an all-day event. A time with no offset fails the
  call.

## Guests and emails

nixie counts every attendee of an event as a guest, except the connection's own account. A room or
another resource counts, because Google emails its owner.

- A tool without guests calls Google with `sendUpdates=none` and has no guest argument. A
  with-guests tool calls with `sendUpdates=all`. `calendar.respond` is a `send` with
  `sendUpdates=all`, and its destination and reply target are the event's organizer.
- A change or cancel without guests reads the event in `prepare` and again in its attempt, and
  refuses with `has_guests` when the event has a guest. A with-guests tool refuses with `no_guests`
  when the event has no guest before the change and none after it.
- A change or cancel refuses with `not_organizer` when the organizer's address is not the
  connection's account, and with `cancelled` for an event that is cancelled. Google's `self` flag on
  the organizer says only that the event sits on a calendar that the organizer owns, which a
  calendar the account can write also shows, so the check never reads it.
- A change that sends the guest list back keeps every attendee field that Google holds, such as the
  comment and the extra guests, because a patch replaces the whole array.
- A change or cancel with guests sends the `etag` of the attempt's read in `If-Match`. On a 412 the
  connector reads the event again. When the guests differ from the checked ones, it answers
  `destinations_changed`, and otherwise `refused_retryable`.
- A with-guests tool's destinations are the guests that `prepare` read, so the decision point checks
  each of them. `calendar.create_event_with_guests` takes its `guests` as destinations, and its
  input resolver rewrites them first: lowercase, once each, without the connection's own account. A
  call that names only that account refuses with `no_guests`. A change drops the account from
  `addGuests` the same way.
- An attempt compares the event's guests with the checked destinations before it applies any other
  refusal, so a guest that left after the approval answers `destinations_changed`, never
  `no_guests`.

## Markers

Every calendar create and change, `drive.create` and `drive.change` writes one private property in
the same request as its change. Calendar keeps it in `extendedProperties.private`, and Drive in
`appProperties`, which only nixie's OAuth client reads.

- The key is `nixie` and the action ID without hyphens. The value is the epoch second at which the
  queue recorded the action, the same for every attempt of it.
- The item keeps the 10 newest markers of all, the incoming one counted by its own value, and the
  write deletes the older ones in the same request. A later action on the same item can run while an
  earlier one is unknown, and its marker must not hide the earlier one. A delayed action older than
  the 10 stored markers writes none, and its check then answers inconclusive.
- The queue gives each attempt and each check the time it recorded the action as `queuedAt`, so no
  connector reads the queue's tables.
- A calendar create's event ID is the action ID without hyphens. A 409 on that insert means the
  event exists, and the attempt answers done.
- A check of a create finds the event by its ID or by a search for the marker. A check of a change
  finds the marker on the item. It answers not found only when the item holds fewer than 10 markers,
  because a full set may have pushed the marker out. A full set without it answers inconclusive.
- A cancel's check reads the status: `cancelled`, or a 404 or 410, is found. A 410 on a cancel's
  retry counts as done. The check of a create on a calendar other than `primary` reads that calendar
  for both lookups, with-guests tool or not. A check of `calendar.respond` finds the account's
  response on the event and never answers not found.

## Reads

- Every field that holds someone else's words is of source `untrusted`: titles, locations,
  descriptions, organizers, guests, calendar names and file names and text. The tool wraps each as
  outside content, and the call's record keeps the plain text.
- Fields that nixie re-emits from a fixed shape stay `untrusted` in the declaration and carry
  `x-endorsed` in the output schema: an event's start, end, all-day flag, status and your response,
  and a file's type, size and time of change.
- `drive.read` exports a Google Doc as Markdown, a Sheet's first sheet as CSV and a Slides file as
  plain text. It reads other text files and images as `gmail.read_attachment` does, and answers
  `unsupported` for every other type. A file over the reader's size limit answers `too_large`
  without a download. Each part returns the file's `modifiedAt` and `version`. A later part that
  passes an earlier part's `version` answers `FILE_CHANGED` when the file's version differs, even
  when its `modifiedAt` is the same. A read downloads the content between 2 reads of the file's
  metadata, and answers `FILE_CHANGED` when its `version` moved, so no part carries a time that
  belongs to other content.
- `drive.search` runs a full-text query, and escapes each quote in it, so the query's text cannot
  widen the search. A search that finds nothing tells the model that it searched only the files you
  chose and the files nixie made.

## Drive writes

- `drive.create` makes the file in your My Drive root, shared with no one. With `google_doc` it
  imports the text as Markdown into a Google Doc, and with `text` it makes a plain text file.
- `drive.change` replaces the whole content and optionally the name. It reads the file in `prepare`
  and in its attempt, and refuses with `shared_file` for a file that is shared with anyone or sits
  in a shared drive, so a Drive write never reaches another person. It also refuses `trashed` and
  `unsupported_type`. The attempt reads the file again right before the upload, and refuses a file
  that became shared by then. Drive takes no precondition on a write, so it also reads the file the
  upload answers with, and refuses with `shared_file` when the file became shared in between. A
  window remains: Drive v3 offers no conditional or atomic upload against sharing, so a file shared
  between that last read and the upload still gets the change.
- A check of a `drive.create` follows every page of the marker search, because Drive can answer a
  page with no file and a token for the next.

## The cards

Each tool's card is built in `prepare` or from the call's input. The cards and the destinations:

| Tool                                | Sentence                                             | Approve button   |
| ----------------------------------- | ---------------------------------------------------- | ---------------- |
| `calendar.create_event_with_guests` | Invite {guests} to "{title}" on {start}              | Send invitations |
| `calendar.change_event_with_guests` | Change "{title}" on {start} and email {guests}       | Send changes     |
| `calendar.cancel_event_with_guests` | Cancel "{title}" on {start} and email {guests}       | Cancel and email |
| `calendar.respond`                  | Tell {organizer} you {response} "{title}" on {start} | Send response    |
| `calendar.create_event`             | Add "{title}" on {start} to {calendar}               | Add event        |
| `calendar.change_event`             | Change "{title}" on {start}                          | Change event     |
| `calendar.cancel_event`             | Cancel "{title}" on {start}                          | Cancel event     |
| `drive.create`                      | Create "{name}" in Drive                             | Create file      |
| `drive.change`                      | Replace the content of "{name}"                      | Replace content  |

A calendar card shows the title, the times with their zone, the calendar, the location and each
guest. A change card shows each changed field before and after, a description in full. The card's
facts of a change, a cancel and a response are sealed on the call's record when `prepare` reads
them, so a forget of the record removes them, and the card reads them from there. A time shows in
the zone of your newest message, else the deployment's default zone. `readGoogleBodyFields` chains
the Gmail, Calendar and Drive cards for the approvals API.

## The Drive picker

`drive.file` lets nixie see only the files it made and the files you choose. You choose files on a
connection's page with "Choose Drive files":

1. The page loads Google's sign-in script when it shows, and enables the button once the script has
   loaded, because a popup that waits for the script can miss the browser's time after a click. On
   the click it asks Google's sign-in for an access token of its own, with the scope `drive.file`,
   `include_granted_scopes` false, the connection's OAuth client ID and its account as `login_hint`.
   The page drops a token whose scope holds anything besides `drive.file`, with an error. The button
   shows for a connection that holds the `drive.file` scope, whatever other scopes it lacks.
2. The page opens Google Picker with that token, the client's picker key and its project number as
   the app ID.
3. The page sends the chosen file IDs to `connections.checkPicked`. The server reads each file with
   the connection's own token and answers its name and whether nixie can see it. The page shows a
   file that nixie cannot see with the likely cause, a choice under another Google account.

The connection's tokens carry `gmail.modify` and never reach the browser, and the browser's token
never reaches the server. The web server sends
`Cross-Origin-Opener-Policy: same-origin-allow-popups` on every page, so Google's sign-in window can
reach back to the page that opened it. A client with no picker key or project number hides the
button and links the setup step. The client's public ID comes back with the setup reading for this
purpose.

## Testing

The connector's `test-utils` folder holds a fake Calendar and a fake Drive beside the fake Gmail.
The fake Drive holds a request on demand, and can answer leading list pages with no file. The fake
Calendar pages its calendar list, and refuses a stale `If-Match` with 412, an insert of an ID that
exists with 409, and a delete of a cancelled event with 410. Each fake records its requests and
writes, and fails or holds a request on demand. `startGmailTools` builds all three groups of tools
on one loopback HTTPS site. The test build's fake Google site serves the same fakes on their paths,
with one event and one file, and the `calendar-tools` and `drive-tools` verify journeys run against
them. A local journey cannot open Google's own picker window, so the choice of files runs only in
the web client's tests, against stand-ins for Google's scripts.
