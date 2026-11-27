# Devices

A device is a browser that shows what the assistant puts on its screen. Every client that the user
signs in is a device: a browser or an app with a full session holds a client device, and a browser
with no session enrols with a device code and a name, and gets a screen device with a device session
of its own. A client is one signed-in browser or app and its session, so ten tabs of one browser are
one device. The device opens the device form of the live stream and sends its screen size. The
assistant lists devices and shows markdown or an image on a screen that is on. On a call, it may put
a long answer on the call's device. The camera, the speaker and the microphone are not built: a
device record holds their capabilities, and every one of them stays off.

Read this doc before you change the `devices` module, a device tool or device mode. The `devices`
module holds the record, the screen state, the open streams and the tools. For registration,
enrolment and the session scope, read the [API](api.md) doc. For device mode and the device view,
read the [web client](client.md) doc.

## Enrolment and the session scope

A session has a scope, `full` or `device`, stored on `identities`. Each enrolment code stores the
scope of the session it makes, on `enrolment_codes`. `sessions.enrol` takes no scope, so the session
takes the scope of its code: a device code makes only a device session, and a full code only a full
session.

A device row belongs to one session, and a session holds at most one, from its enrolment until a
revoke or a sign-out removes the row. Enrolment always writes the row, and the migration below gives
each earlier client session one, so a client session holds a row from the day it is made. The row's
`device_kind` is `client` for a full session and `screen` for a device session. A client device
starts with its screen on, so the assistant may draw on it, and the user sees what it drew only when
they open the [device view](client.md#the-device-view). A screen device starts with every capability
off, and its screen stays off until the device switches it on. The migration that adds `device_kind`
gives each existing client session that is not revoked and has no row a client row, named with its
label and with the screen on, and makes the row that `devices.register` wrote a client row that
keeps its name and screen.

1. A signed-in client calls `sessions.issueCode({ scope: 'device' })`, and the page `/add-device`
   shows the code. `nixie enrol-code device` issues the same code from the host.
2. A browser with no session opens `/device`, and enrols with the code and a name. Enrolment writes
   the `devices` row in the same transaction as the session, for a full code and a device code, and
   for a cookie and a bearer session alike, so the phone app is a device too.
3. A browser with a full session may call `devices.register({ clientActionID, name })`. A device
   session may not call it. The call renames the session's row in one write transaction, leaves its
   screen as it is, and returns the device's short ID. It writes a client row when the session holds
   none. It issues no code, makes no session and never touches the cookie. A retry with the same
   client action ID and name returns the same ID, and the same ID with another name gets
   `CLIENT_ACTION_ID_REUSED`.
4. The device switches its screen on with `devices.setCapability`. The call sets only `screen`, and
   only on the session's own device row. A call with no `isOn` changes nothing and answers the
   screen as the row holds it.

`live.follow` in its device form, `devices.setCapability`, `devices.readImage` and `devices.resize`
act on the caller's own row. A full session whose row is missing, a case the server does not expect
but still answers, gets `NOT_A_DEVICE` and may register to get one. A device session whose row a
revoke removed gets the refusal of a missing session.

A device session may call only `live.follow` in its device form, `devices.resize`,
`devices.pageError`, `devices.pageEvent`, `devices.pageData`, `devices.setCapability`,
`devices.readImage` and `sessions.signOut`. `create-api-app.ts` refuses every other call from a
device session with 403. The test in `create-device-procedures.test.ts` walks every contract path to
keep that list true. A revoke or a sign-out of a session, full or device, removes its device row and
ends its open streams. A full session's revoke also closes its computer watch sockets. A reset keeps
the device rows and clears what they show.

## The device record

The `devices` table holds a short ID from `createShortID`, the identity, the name, the capabilities
as JSON, and two pointers: `shown_sequence` and `idle_sequence`. Each pointer names the record that
holds what the screen shows:

- `device.shown` holds one show: the content, sealed under the record's own key, and `until`. A show
  that waits for an offline device holds no `until` and a `lastsMs` instead. When the device comes
  online, the server writes the show again with an `until` that lies `lastsMs` after that time.
- `device.idle_set` holds one idle scene, sealed the same way.
- `device.capability_changed` holds a switch of a capability.

A forget of a `device.shown` or `device.idle_set` record erases the content. The state reader then
drops that content, and an image that is forgotten or missing counts as erased too. The server keeps
no copy of the content outside the log, apart from the files of a preview while it draws one.

## The screen state

`readScreenState` reads the two pointed records, and `pickScreenState` picks the show while it has
no `until` or its `until` is ahead, and the idle scene otherwise. A new show replaces the one before
it, and an `until` that passes ends the show, never returning to an older one. `pickScreenState`
never returns the layout. The device page's `pickSurface` and `devices.list` put the layout in place
of the idle scene when a region shows content or has a background, as
[Layouts and regions](#layouts-and-regions) says. An idle device with no scene shows black.

## Layouts and regions

A layout is a grid of 1 to 12 columns and 1 to 12 rows, each a whole number of `fr` from 1 to 12,
with up to 36 named regions. `device.layout` returns `BAD_LAYOUT` for a grid of 13 columns, 13 rows
or 37 regions, with the cap in its message. A region name is 1 to 32 characters of `a-z`, `0-9` and
hyphens, and a region spans one or more tracks without overlapping another or leaving the grid. A
region can take a `background`: a colour from the palette `black`, `white`, `gray`, `red`, `orange`,
`yellow`, `green`, `teal`, `blue`, `navy`, `purple`, `pink` and `brown`, or `#rrggbb`.

The background belongs to the grid, so a new layout sets it again. A region holds markdown (up to
20,000 characters), an image with `fit` `whole` or `fill`, or a live value: a clock in `HH:mm`,
`HH:mm:ss` or `EEE d MMM`, or a countdown to a time with an optional label. A region can also hold a
[page](#page-regions): up to 200,000 characters of HTML, up to 20 images, up to 20
[approved packages](#packages) and up to 8 [declared fetches](#declared-fetches).

These record kinds hold a layout and its content, and these tables point at those records:

- `device.layout_set` holds the grid and a short ID. A clear writes one with no grid.
- `device.region_shown` holds one region's content, sealed under the record's own key, with the
  content kind, `until`, the `onEnd` choice and the short ID that `devices.list` shows.
- `device_layouts` points each device at its newest `device.layout_set` record.
- `device_regions` points each region at its newest `device.region_shown` record.
- `device_saved_layouts` holds the layouts saved under a name, one row for each device and name,
  with a random UUID key the assistant never sees. A row holds sequences alone: the sequence of the
  `device.layout_set` record and the sequence of each region's `device.region_shown` record.

A new layout writes its record and repoints the device. It deletes the pointer of each region whose
name the grid drops and keeps the pointer of each region whose name it keeps, so a kept region keeps
its content and every other region starts blank. A layout never times out.

### Saved layouts

`device.layout_save` stores the layout the device holds under a name, and a save under a name that
is taken replaces that layout. It writes a `device.layout_saved` record. `device.layout_restore`
puts a layout back in one write transaction: it writes a new `device.layout_set` record with the
saved grid, points each region at its saved content record, and writes a `device.layout_restored`
record. A `device.region` call that waited for approval against the layout before the restore still
fails, because the restore wrote a new `device.layout_set` record. `device.layout_remove` deletes a
saved layout and writes a `device.layout_removed` record. None of the three records is erasable.

A saved layout holds no copy of the content, so a forget has nothing more to erase. A restore leaves
a region blank when a forget erased its content record, and the result lists those regions in
`emptied`. A save stores the record each region shows at that time, and a restore points the region
at that record only. So a region whose saved record's minutes ran out after the save comes back
blank and is listed in `emptied`, even with `then: 'previous'`. A reset deletes the saved layouts
along with the layout pointers, and so does a device removal, which a revoke or a sign-out of the
device's session causes.

The record kinds `device.layout_saved`, `device.layout_restored` and `device.layout_removed` have an
empty list of live topics, as the other layout records do: a device page follows its own stream,
which wakes on every commit, and no client query reads a saved layout.

`readLayout` reads a region at the time it is asked, so no timer writes and a restart loses nothing.
A region shows its newest record while the record has no `until` or its `until` is ahead. After that
the region goes blank, or with `then: 'previous'` shows the record it covered, which follows the
same rule and its own `onEnd`. A forget of a record erases its content, and the region goes blank. A
region whose image is forgotten or missing goes blank too. A reset, a revoke and a device removal
delete the layout and region pointers.

A show covers the layout without touching it, so a region's minutes keep counting under a show. The
screen draws, in order, an unexpired `device.shown` record, the layout while at least one region
shows content or has a background, then the idle scene.

`device.region` reads the layout when its call runs, so a call that waited for approval fails with
`UNKNOWN_REGION` when a clear or a new layout removed its region in the meantime. A layout set after
the call's own record also fails the call, even when it keeps the region's name, so an approval
never fills a region of a layout the user did not see. The write checks that, and reads the region
and the content it covers, in its own transaction, so two calls for one region never cover the same
content. Until that write commits, the region keeps its content.

## The streams

The device form of [`live.follow`](./live-updates.md#the-stream) takes the screen's size in pixels,
its `pixelRatio`, device pixels per CSS pixel, and the browser's IANA time zone, which the device
sends again on each reconnect and in each `devices.resize`. A page that sends no time zone gets the
deployment's default in a preview. The server keeps each open stream and its size in memory in
`createDeviceStreams`, which the API's client registry holds. A device is online while it has a
stream open, and for `deviceOfflineGraceMs` after its last one closes, so a reconnect never reads as
offline.

For an offline device, `devices.list` gives the time its last stream closed, unless the process
restarted since. `devices.resize(pixels)`, which takes the fields that `live.follow` opens with,
gives every open stream of the caller's device a new size, and `devices.list` reads the new size at
once. A resize also keeps its size against a stream that opens later, so a second tab of the same
client never replaces the size that the device view reported, until every stream of the device has
closed. One pixels schema bounds the size in both calls. The stream sends `opened` first, then what
the screen shows now. A later event follows a commit that touches the device, or the end of a show
or of a region's minutes. The stream sends an event only when the state changes. The event of a show
carries the `fit` of an image, `whole` or `fill`.

A region's `layout` event carries the short ID of the region's `device.region_shown` record as
`shown`, which the device names in the errors it reports. The layout travels in its own `layout`
events, separate from the `show` and `idle` events. A stream sends one when the device holds a
layout, and again when the grid or a region's content changes, a region's minutes pass or a forget
blanks a region. A clear sends a `layout` event with no layout. A stream that opens on a device with
no layout sends no `layout` event. The stream wakes at the earliest end among the show and the
regions, including while a show covers the layout.

`devices.readImage` serves an image only while it is in the current show, the idle scene or a region
of the layout, and returns `NOT_SHOWN` otherwise.

A `message` event carries a message that `device.sendToPage` sent, with the region, the short ID of
the content it was for, the data and whether it was retained. The stream sends it only to the
streams of that device, and the device drops it when the region no longer shows that content. A
message to a stream that is not open is lost, except a retained message: each time the stream opens,
it sends the retained message of each page region right after its first layout.

## Page regions

A page is a region whose content has `kind: 'html'`: the `html` in a body, `images`, a list of
image-store short IDs the page may show, `packages`, a list of `name@version` strings, and
`fetches`, a list of URLs with an optional `refreshMinutes`. The server keeps no copy of the markup
outside the record that seals it, apart from the files of a preview while it draws one, and
`devices.list` never shows it.

### The frame

The device page shows a page in an `<iframe sandbox="allow-scripts">` with no other sandbox token,
so the page runs scripts in an opaque origin. In that origin the page has no cookie, no storage and
no access to the device page's DOM, and it can't navigate the device page. The frame loads from
`/rpc/device/frames/<ticket>`, and the page's images from `/rpc/device/images/<ticket>`. These two
paths take no session and no client header: the ticket in the path is the credential, and
`answerPageRequest` runs before the client-header check.

A ticket names a device, a region and one `device.region_shown` record. The server issues the
tickets in memory when it builds a `layout` event.

A ticket stays the same while the stream and the region show the same content. A request reads the
layout at that moment and answers 404 unless the region still shows the content that the ticket
names. The response carries `no-store`, `nosniff` and `no-referrer`. The frame's own policy sets
`default-src 'none'`, scripts and styles inline, `connect-src 'none'`, `form-action 'none'`,
`base-uri 'none'`, and images only from that page's image URLs and `data:`. Scripts and styles may
also load from the file paths of the [packages](#packages) that the page names, and fonts from those
paths and `data:`. So the policy keeps a page from fetching, opening a socket, submitting a form or
loading anything else, and the bridge closes the ways out that the policy leaves open, as below. The
device page's own policy adds `frame-src 'self'`, which keeps a page from framing another site. A
page can still navigate its own frame. Each test of the policy runs in a real browser, in
`answer-page-request.browser.test.ts`.

The policy also sets `sandbox allow-scripts`. A person who opens the frame's address in a tab gets
the same opaque origin, and the page reads none of the app's storage.

The policy leaves these ways out of the frame open. A peer connection reaches any server its page
names. A link element opens a connection from a resource hint such as `preconnect`, and no directive
closes it: Chrome opens a preconnect's connection under `connect-src 'none'`, and blocks only a
prefetch. A frame, object or embed element gives the page a second window, where the bridge's guards
don't run. nixie closes them this way:

- The input check of `device.region` fails a page that holds a link, frame, object or embed element.
  A page needs none of them: it has no network, and its styles go in a style element.
- The bridge removes `RTCPeerConnection` and `XSLTProcessor`, which builds elements by name. It
  makes `createElement`, `createElementNS` and `createDocument` build a span in place of a link,
  frame, object or embed element, with a namespace prefix or without.
- The bridge refuses `document.write` and `document.writeln`, because a page can split a start tag
  across 2 writes, and no check of each write sees the whole tag.
- The bridge cleans each string that the page turns into markup, so a string never brings the
  elements back, with or without a namespace prefix.

In a browser with trusted types, the refusal and the cleaning come from the bridge's `default`
policy, the one policy that the frame's policy requires and allows. The browser calls that policy
itself, so no script can undo it. A browser without trusted types gets them from the bridge's own
wrappers around `document.write`, `document.writeln`, `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, `srcdoc`, `DOMParser` and `createContextualFragment`.

The bridge's guards call only the built-ins it took before the page's script ran, so a page that
replaces a built-in, such as a method of `RegExp`, changes no guard. The browser test opens each of
those ways against a server that counts connections, in Chrome with trusted types and with trusted
types hidden from the frame, and expects none. The response also sets `x-dns-prefetch-control: off`.
The frame builder and the bridge live in `libs/wire`, so the device page's own browser tests frame
their pages with the same bridge.

The frame's URL is built from the request's own origin, with the forwarded protocol and host
cleaned, so a page behind a reverse proxy loads its images from the same origin as the frame. The
recipe's proxy trusts the forwarded protocol and host of the HTTPS proxy in front of it, and
`check-forwarded-proto.ts` checks that it hands them on. The proxy's log drops each frame ticket and
image ticket from a request address, which `check-ticket-log.ts` checks.

### The page bridge

An inline script defines the frozen global `nixie` in each page:

- `nixie.send(name, data, { wake })` sends an event. The name and the JSON data each have a size
  limit, which `pageEventDataLimitBytes` and the contract's schema hold.
- `nixie.onMessage(handler)` takes each message that `device.sendToPage` sent. A message that comes
  before the handler waits for it, and the page's retained message comes first.
- `nixie.image(id)` returns the URL of a declared image.
- `nixie.data(url)` returns the last response of one of the page's
  [declared fetches](#declared-fetches) as `{ status, type, body, fetchedAt }`. Otherwise it rejects
  with an error whose `code` is `NOT_DECLARED`, `REFUSED`, `NOT_READY` or `STALE`. See
  [Declared fetches](#declared-fetches) for when each code applies.
- `nixie.onData(handler)` calls the handler with the URL of each declared fetch that refreshed.

The bridge takes a message only from its parent window, so a sibling frame can't send the page one.
It reports an uncaught error to the device page, which reports it with `devices.pageError`, so
`device.preview` shows it. The device page only takes a message from the window of its own frame.

A touch inside a frame never reaches the device page, so the bridge sends the device page a `touch`
message, at most 4 times a second. The device page then shows its buttons as it does for a touch of
its own, so a page that fills the screen leaves the user a way to close it, switch off the screen or
sign out.

A page that replaces another page loads in a new frame, so a message for the new page never goes to
the document of the old one.

### Packages

`device.addPackage({ name, version })` asks the user to approve one npm package at an exact SemVer
version, with no range, no tag and no leading zero in a number. The call declares `install_package`,
an effect of the always-ask risk class, so the card needs the passkey and offers no always-allow,
and each new version is a new approval. The call runs queued.

1. The call reads the registry's document for that version through the fetch sandbox. The registry's
   address is the `web_fetch.package_registry` config key, `https://registry.npmjs.org` by default.
   A package over the unpacked size limit is refused with `TOO_BIG`.
2. The call stores a card with its own record: the name, version, publisher, size, the publisher's
   description and the registry's sha512 hash. The approval card shows it, and marks the description
   as the publisher's words.
3. The call's destination is the registry's host, and its expected URL is the tarball's address with
   the hash after a `#`. The action hash covers the expected URL, so an approval binds the hash.
4. After the approval, the call reads the registry's document again. A hash that differs from the
   card returns `INTEGRITY_CHANGED` and stores nothing.
5. The fetch sandbox downloads the tarball from the registry's own host, checks it against the
   approved hash, and unpacks it. It refuses the whole package for a link, an absolute path, a `..`
   segment, a path outside the package folder or a size past that limit. A directory entry outside
   the package folder refuses the package too. A redirect of the registry's host to http or to
   another host fails the read and the download.
6. The server writes the files to a staging folder, then writes a `device.package_added` record and
   a `device_packages` row in one transaction, and only then moves the files to
   `device-packages/<name>@<version>/` in its data folder. A call that finds the row already there,
   as a racing install of the same version does, returns `PACKAGE_KNOWN` and leaves the files of the
   first call, so the files served always match the hash that the row holds.

A page names an approved package as `name@version` in `packages`. `device.region` returns
`UNKNOWN_PACKAGE`, and leaves the region as it was, for a package that nobody approved. The frame's
policy opens script, style and font loading to the paths of the packages that page names, and to no
other approved package. The API serves a file at `/rpc/device/packages/<name>@<version>/<path>` only
when the package's file list holds the path. The route takes no session, because the frame's opaque
origin sends no cookie, and the route serves public npm code alone. A page loads a file with a
`script` element, or with an `@import` inside a `style` element, because a page holds no `link`
element.

Backups leave package files out. On start, the server downloads again each package whose files are
missing, and checks the same hash.

**Why:** a page never loads code from outside nixie, and nothing updates by itself.

### Declared fetches

A page's `fetches` holds the URLs the page reads, each an `https` URL with a host that has a dot and
is no private address, and with an optional `refreshMinutes` from 5 to 1,440. A page script can't
name a URL of its own, so it can't put what it holds into a query string.

- `device.region` declares a `read` effect with the host of each fetch as a destination. When the
  call is sent, it asks the user about each host that no rule allows, and the page never shows when
  the decision point denies one of its hosts.
- The `devices` module runs each fetch when the region shows, and every `refreshMinutes` after,
  while the device is online. The fetch sandbox reads the response as text, up to a size limit, with
  GET alone. The fetch follows at most 3 redirects, each on the declared host and on `https`. A
  redirect to another host or to `http` fails the fetch. When a host answers with a rate limit, the
  server pauses every fetch of that host, as the web fetch does.
- The fetch refuses a declared URL or a redirect that holds a secret the web fetch's own scan
  refuses, and `nixie.data` rejects with `REFUSED` for it.
- The first fetch right after the call needs no second decision. Every later fetch, and every fetch
  of a page that came back from a restart or a restore, asks the decision point again with the
  stored call and no card. A fetch that the rules no longer allow never runs, and `nixie.data`
  rejects with `REFUSED` for it.
- The server keeps the last response of each fetch in memory, and fetches again after a restart.
  Before each fetch, the `devices` module reads the layout again. It starts no further fetch for a
  page that a call replaced, that a temporary replacement's expiry ended or that a forget erased,
  and drops what that page held. The server keeps the fetch schedules of a device's pages while the
  device is offline or has its screen off. When the device is back, each fetch that has run once
  asks the decision point again.
- A refresh sends the page's open stream a `data` event with the region, the content's short ID and
  the URL. The device page then posts `data-changed` into the frame, and the page's `nixie.onData`
  handlers run.
- The page's `nixie.data(url)` posts a `data` message to the device page, which calls
  `devices.pageData({ region, shown, url })` and posts the answer back. The call reads the layout
  for its answer: it returns `STALE` for content that the region no longer shows, `NOT_DECLARED` for
  a URL that the shown page did not declare, then `REFUSED` or `NOT_READY` or the response.

A fetched response is outside content. It reaches the assistant in a page event the page sends,
which arrives inside an untrusted block, or in a [preview](#the-preview) picture of the page, which
counts as outside content too. A refused fetch reaches the assistant as a page error.

**Why:** the decision point judges the URLs when the page is sent, and the page's script can't build
new ones, so it can't leak what it holds to an allowed host. A declared fetch shares the web fetch's
pause for each host.

### Events from a page

The device page sends a page's event with `devices.pageEvent({ region, shown, name, data, wake })`,
which a device session may call. It drops an event past 1 a second and 30 a minute for each region,
and the server applies the same limits and drops the rest. The call returns `STALE`, and keeps
nothing, when the screen is off or the region no longer shows the content that `shown` names. The
server reads the region, the limit and the hour's wake count in the same write transaction that
keeps the event, so two events that arrive together never both take the last wake of the hour, and a
replacement that commits first makes the event stale.

A page event is outside content, as a web page is. The server writes a `device.page_event` record
with `contentSource` `untrusted` and the event's data as an erasable field, so a forget erases it.
The record names the device, the region, the event name and whether it woke the conversation. The
assistant reads the text inside the markers of an untrusted page read, never as an instruction. A
page event carries no authority: it is not the user's message, and no rule treats it as one.

The wake is the page's request, and the server grants it for at most 6 events an hour for each
device. A page event with a wake it was granted is an inbox record, which wakes a step and reaches
the conversation as a `page-event` system message. An event with no wake, or past that limit, is no
inbox record, and the next turn's events block lists it. A page event that woke the conversation
never also shows in the events block.

A page event marks the step's policy frame as holding outside content as soon as it reaches the
model. A rule that allows a call on owner content and asks about one on outside content then asks.
The mark covers an event in the step's opening batch, an event that the turn's events block lists,
and a waking event that lands while the turn runs.

### Messages to a page

`device.sendToPage` sends data into the page of a region. With `retain: true` the server also keeps
the message as the page's state, the newest one for each page region, in memory in the stream
registry. A stream hands that message to the page each time the page loads, after a reload or a
reconnect, until new content replaces the page. The server forgets it on a restart. A
`device.region` call that writes any content drops the region's retained message and its tickets, so
a temporary replacement that ends with `previous` brings the earlier page back with no state and new
tickets. The device page keeps each region's newest retained message past its limit of 200 messages,
so a frame that loads again on the same stream starts from it. A layout event that no longer shows a
page drops that page's messages, so a page that a replacement gives back starts with no state. A
retained message is kept even when the device is offline, and the call then returns `OFFLINE`.

## The call's device

During a call, the assistant keeps its spoken reply short and may put a long answer, such as this
week's plans, on the call's device, then say where it is. The [call](calls.md) adds no path from a
call to the device tools: the call's turn already gets the conversation's tools, the device tools
among them.

- `devices.list` marks `onCall: true` on the one device whose session is the call's carrying session
  while the call is `live`, and `false` on every other device, before the call is live and after it
  ends too. The server wires the carrying session from the calls module as a `ReadCallSession`
  dependency of the device tools, so neither module imports the other. When calls is off, no call is
  live, so `onCall` is `false` on every device.
- No tool takes "the call's device" as a target. The assistant passes the device's short ID from
  `devices.list`, as for any other device.
- The call turn's prompt tells the assistant to keep a spoken reply to about 3 sentences, and to put
  a longer answer on the device that `devices.list` marks `onCall`. Showing anything is the
  assistant's choice each time.

## Waking the model

`devices.watch({ device, wake })` sets the list of changes that wake the model, and each call
replaces the list before it. The list is the newest `device.watch_set` record for that device, and a
device that no call named has an empty list. When a device's change to online or offline is on its
list, the server writes a `device.status_changed` record to the conversation's thread, which the
conversation reads as an inbox record and which wakes a step. A change that the list leaves out
writes nothing. A device counts as offline once it has had no open stream for
`deviceOfflineGraceMs`, so a reconnect inside that time wakes nothing.

## The tools

| Tool                    | What it does                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devices.list`          | Lists each device: `shortID`, name, `deviceKind`, `onCall`, screen, camera, online, `offlineSinceMs`, `wake`, pixels, `pixelRatio`, what it shows and the layout it holds |
| `devices.watch`         | Sets which changes of a device wake the model: `online`, `offline`, both or none                                                                                          |
| `device.show`           | Shows markdown or an image, with `fit` `whole` or `fill`, for `minutes` or until the next show                                                                            |
| `device.setIdle`        | Sets the idle scene: up to 8 blocks and 20,000 characters of markdown in all                                                                                              |
| `device.layout`         | Sets the grid and its named regions, or clears the layout with `clear: true`                                                                                              |
| `device.region`         | Fills one region, for `minutes` with `then` `blank` or `previous`, or until its next call                                                                                 |
| `device.layout_save`    | Saves the device's layout under a name, replacing a saved layout of that name                                                                                             |
| `device.layout_restore` | Puts a saved layout back: its grid and every region's content                                                                                                             |
| `device.layouts`        | Lists the saved names, each with the time it was saved                                                                                                                    |
| `device.layout_remove`  | Deletes a saved layout                                                                                                                                                    |
| `device.addPackage`     | Asks the user to approve one npm package at an exact version, then stores its files for pages to load                                                                     |
| `device.sendToPage`     | Sends a message into the page of a region, and keeps it for each load of the page with `retain`                                                                           |
| `device.preview`        | Returns a picture of the screen and the errors the device reported, as [The preview](#the-preview) describes                                                              |

All of them but `device.addPackage` declare the `note` effect and run direct, inside the turn. A
`device.region` call that declares fetches also declares a `read` of each fetch's host. Each call
still goes through the user's rules, so an ask rule can hold it for approval. `device.addPackage`
declares `install_package`, which no rule allows without a card, and runs queued. `device.show`
checks in this order and returns the first refusal: `UNKNOWN_DEVICE`, `SCREEN_OFF`, then the image
refusals `UNKNOWN_IMAGE` and `IMAGE_FORGOTTEN`. A show to an offline device refuses nothing: the
show waits, the device shows it when it comes back online, and the result carries `waiting: true`
with a message that says so. The `minutes` of a show that waits count from the time the device comes
online. An image is an [image store](../connectors/images.md) short ID.

`device.layout` returns `UNKNOWN_DEVICE`, `SCREEN_OFF`, `BAD_LAYOUT` with the reason, then
`OFFLINE`. `device.layout_save` returns `UNKNOWN_DEVICE`, then `NO_LAYOUT` for a device that holds
none. `device.layout_restore` returns `UNKNOWN_DEVICE`, `SCREEN_OFF`, `OFFLINE`, then
`UNKNOWN_LAYOUT`. `device.layout_remove` and `device.layouts` return `UNKNOWN_DEVICE`, and the
remove call returns `UNKNOWN_LAYOUT` too. An `UNKNOWN_LAYOUT` message lists the saved names.

`device.region` returns `UNKNOWN_DEVICE`, `SCREEN_OFF`, `UNKNOWN_REGION`, `UNKNOWN_PACKAGE`,
`BAD_FETCH`, `FETCHES_UNAVAILABLE`, the image refusals, then `OFFLINE`. Its input check fails a page
that holds a link, frame, object or embed element before any refusal. `device.region` also returns
`UNKNOWN_REGION` when a layout was set after the call's own record. `device.sendToPage` returns
`UNKNOWN_DEVICE`, `SCREEN_OFF`, `UNKNOWN_REGION`, `NOT_A_PAGE` for a region that holds no page, then
`OFFLINE`. `device.preview` returns `UNKNOWN_DEVICE`, then `SCREEN_OFF`.

`devices.list` shows the layout a device holds even while the device is offline. Its `showing` is
null while the device is offline, and otherwise follows the screen's order: it is `layout` while no
show covers the layout and at least one region shows content or has a background. For each region,
`devices.list` gives the kind, `until` and the short ID of its `device.region_shown` record, and for
a page region also its packages and the URLs of its fetches. It gives none of the rest of a region's
content, such as its text, its image or its HTML. A blank region has a null kind.

## The preview

`device.preview` shows the assistant what a screen looks like and what went wrong on it. A web page
cannot take a picture of its own screen without a prompt on the device, so the picture is a render
of the same layout at the same size.

```mermaid
flowchart LR
  tool[device.preview] -->|"layout files, size in pixels, pixel ratio"| render[render sandbox]
  render -->|"PNG"| tool
  device[device page] -->|"devices.pageError"| errors[errors in memory]
  tool --> errors
```

The result holds the screen size in device pixels and the pixel ratio, the errors, and `picture`:
`shown` with the picture beside the result, or `unavailable` with none. The size is null while the
device is offline, and an offline device still returns its last errors. The picture is `unavailable`
when the device is offline, when the render fails or passes its time limit, when the model's image
caps have no room for it, and when nixie has no render sandbox. The tool's description tells the
assistant that the picture proves nothing about what the device shows, because fonts and drawing can
differ.

### The render

`startRenderSandbox` in the `connectors` module runs each render in a new sandbox that has the rules
of a code run: no network, no grant and no tool route. It destroys the sandbox when the render ends.
A second render waits for the first, and a render never touches the assistant's computer. A render
sandbox that ignores its stop is destroyed after a short wait, so it never holds the queue. The
sandbox takes the code run's kind, because a kind of its own would leave a stored spec that the
release before cannot parse.

nixie starts the render sandbox only when the sandbox manifest holds a render image. A deployment
without one still boots, and each preview of it has `picture: unavailable`.

The `devices` module builds the page that the sandbox opens. It picks what the screen draws as the
device page does: a show, then the layout while a region shows content or has a background, then the
idle scene. `buildPreviewPage` turns that choice into `index.html` and the files that the screen
draws, such as one for each image, so an image that a show covers is never sent. In a markdown
region, the preview keeps raw HTML as text, shows a link as underlined words with no address, and
shows an image as the device does, as a link labelled `image: <alt>`. A clock or a countdown shows
the time of the render, in the time zone that the device's browser sent beside its size, or in the
deployment's default time zone when the device sent none. A script in the page grows the text of
each region to the largest size that fits, as the device page does.

The server sends the files, the screen's size in device pixels and the pixel ratio. The render guest
in `guests/render` starts Chromium on an empty profile in a folder that it removes after the render.

The guest answers each request for one of the page's files from the files it received, refuses every
other request and every WebSocket, and lists the refused URLs in its reply. It waits for the page to
say that its text has fitted, and takes a PNG of exactly the requested width and height. The page
lays out at the width divided by the pixel ratio, rounded up to a whole CSS pixel, and the picture
is cut to the exact size, so a device with an odd width gets a picture of its own width. The server
sends the PNG on at that exact size, so a large screen is not shrunk. The picture is `unavailable`
when the PNG passes the byte limit that the model takes.

A page region draws as a sandboxed frame of its own, from one of the preview's files. That file
holds the same document and policy as the device's frame, with its images by path and its retained
message already in place. The files also hold each approved package that the pages name, under
`packages/`, and the preview rewrites the device's package path in a page to that folder. The bridge
answers `nixie.data` with what each declared fetch last returned, with `REFUSED` for a fetch that
was refused, and with `NOT_READY` for a fetch that has returned nothing yet. The guest renders the
page with scripts on, and the frame has the same sandbox as on the device.

`buildPreviewPage` matches each kind of region content with no fallback, so a new kind fails the
type check until `buildPreviewPage` has a branch for it.

### The errors

The device reports an error that a region's content raised with
`devices.pageError({ region, shown, message })`, which a device session may call. The device page
reports an image that a region cannot read, and reports each replacement image that fails, even one
that fails with the same message as the image before it. It also reports an image that downloads but
does not decode. The server keeps the last 20 errors of each region, in memory, in the stream
registry beside the open streams, so a restart forgets them. The call returns `STALE`, and keeps
nothing, when the region no longer shows the content that `shown` names or the layout has no such
region. The server forgets a region's errors when `device.region` writes the region, and forgets the
errors of each region that a new grid, or a restored layout, clears. A region whose earlier content
returns when timed content ends therefore starts with no errors. A refused fetch of a page is one of
those errors: its message names the URL and the reason, so the assistant sees why `nixie.data`
rejects. `device.preview` returns each error's region, time and message in an untrusted block,
because the text comes from the device. The picture counts as outside content too, because a page
can draw text that it fetched.

## Device mode

Device mode is the route `/device` of the web client, a separate page from the
[device view](client.md#the-device-view). On load, the page calls `devices.setCapability` with no
`isOn`, so the server's screen setting stays as it is, and the answer shows what the browser holds:

- A browser with no session shows the enrolment form, which makes a device session.
- A browser with a full session shows that client's own device with the screen as the row holds it:
  full screen when it is on, and a button that switches it on when it is off. A full session whose
  row is missing shows a form that names the device and calls `devices.register`, then reads the
  screen again.
- A browser with a device session comes back with the screen as the row holds it, which starts off.
  A button switches the screen.

While the screen is off, the page keeps the device form of `live.follow` open, so the device stays
online. Sign out ends a live call before it signs the session out, so the call's microphone and peer
connection close with it.

With the screen on, the page keeps that same stream open. A layout draws as a CSS grid, and each
region keeps its place as another updates. A region with a `background` draws it, with black or
white text, whichever has the higher WCAG contrast ratio on it. Markdown and a live value grow to
the largest size that fits their region, and fit again when the region's size or the text changes. A
clock or a countdown ticks each second from the browser's own time, with no event from the server.
The page renders markdown like a reply and an image on black: `whole` scales it to fit and centres
it, `fill` covers the screen and crops evenly. The page sends `devices.resize` after the window
resizes, at most once per debounce window and only when the size differs from the one the server
has, so the assistant reads the new size within a second. The server takes the size from the
stream's connect until a resize is answered. After that, the resize's size stands against a later
connect, until every stream of the device has closed.

While the screen is on, the page hides its close, full-screen, screen-off and sign-out buttons until
a touch or a pointer move, and shows them for `revealMs` after the latest one. Close leaves full
screen and device mode, and opens the home page. A button toggles full screen on the page's root
element with the Fullscreen API. Its label reads Full screen or Leave full screen, and follows
`fullscreenchange`, so Escape updates it. The page keeps the screen awake with the Wake Lock API
while a stream is open, and asks for the lock again when the page shows again. The web server sends
the page with a Content-Security-Policy that includes `frame-ancestors 'none'`.

## The devices section

Devices are on only while the config has a `devices` section, and the section takes no field yet. A
config without it starts no device part, offers the model no device tool, leaves `devices` out of
`nixie.read`, answers each `devices` procedure and the device form of `live.follow` with
`FEATURE_OFF`, refuses to issue a code for a device session, and serves no device page. When
upgrading from a release before the section existed, add `devices: {}` to the config to keep the
devices.

When the section is there, the server gives the API the device procedures, the device page routes
and the device stream through its feature procedures, adds the device row's session hook, and adds
the device inbox kinds and the package-install card reader to the core lists. For the feature
procedures and the core lists, read the [feature switches](../deployment/server.md#feature-switches)
section of the server doc.
