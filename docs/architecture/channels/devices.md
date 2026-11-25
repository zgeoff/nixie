# Devices

A device is a browser that shows what the assistant puts on its screen. A browser becomes a device
in one of 2 ways. A browser with no session enrols with a code and a name, and gets a device session
of its own. A browser that is signed in names itself, and the session it holds gets a device row.
The device opens the device form of the live stream and sends its screen size. The assistant lists
devices and shows markdown or an image on a screen that is on. The camera, the speaker and the
microphone are not built: a device record holds their capabilities, and every one of them stays off.

The `devices` module owns the record, the screen state, the open streams and the tools. The
[API](api.md) owns registration, enrolment and the session scope, and the [web client](client.md)
owns device mode.

## Enrolment and the session scope

A session has a scope, `full` or `device`, stored on `identities` and on `enrolment_codes`. Only a
code carries a scope: `sessions.enrol` takes none, so a device code can't make a full session and a
full code can't make a device session.

A device row belongs to one session, and a session holds at most one. A device session holds its row
from enrolment until a revoke or a sign-out removes the row. A full session holds one only after it
registers.

1. A signed-in client calls `sessions.issueCode({ scope: 'device' })`, and the page `/add-device`
   shows the code. `nixie enrol-code device` issues the same code from the host.
2. A browser with no session opens `/device`, and enrols with the code and a name. Enrolment with a
   device code writes the `devices` row in the same transaction, with every capability off.
3. A browser with a full session calls `devices.register({ clientActionID, name })`. The call is for
   a `full` session only. It writes the row on the caller's own identity, with every capability off,
   in one write transaction, and returns the device's short ID. It issues no code, makes no session
   and never touches the cookie. A second register renames the row and returns the same ID. A retry
   with the same client action ID and name returns the same ID, and the same ID with another name
   gets `CLIENT_ACTION_ID_REUSED`.
4. The device switches its screen on with `devices.setCapability`. The call sets only `screen`, and
   only on the session's own device row.

`live.follow` in its device form, `devices.setCapability`, `devices.readImage` and `devices.resize`
act on the caller's own row. A full session with no row gets `NOT_A_DEVICE` and has to register
first. A device session whose row a revoke removed gets the refusal of a missing session.

`create-api-app.ts` refuses with 403 each call from a device session except `live.follow` in its
device form, `devices.resize`, `devices.setCapability`, `devices.readImage` and `sessions.signOut`.
The test in `create-device-procedures.test.ts` walks every contract path to keep that list true. A
revoke or a sign-out of a session, full or device, removes its device row and ends its open streams.
A full session's revoke also closes its computer watch sockets. A reset keeps the device rows and
clears what they show.

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
drops that content, and an image that is forgotten or missing counts as erased too. The server never
holds the content outside the log.

## The screen state

`readScreenState` reads the two pointed records and `pickScreenState` picks the state: the show,
while it has no `until` or its `until` is ahead, or else the idle scene. A new show replaces the one
before it, and an `until` that passes ends the show, never returning to an older one. While no show
covers it, the screen draws the layout in place of the idle scene when a region shows content or has
a background, as [Layouts and regions](#layouts-and-regions) says. An idle device with no scene
shows black.

## Layouts and regions

A layout is a grid of 1 to 12 columns and 1 to 12 rows, each a whole number of `fr` from 1 to 12,
with up to 36 named regions. A grid of 13 columns, 13 rows or 37 regions gets `BAD_LAYOUT` with the
cap in its message. A region name is 1 to 32 characters of `a-z`, `0-9` and hyphens, and a region
spans one or more tracks without overlapping another or leaving the grid. A region can take a
`background`: a colour from the palette `black`, `white`, `gray`, `red`, `orange`, `yellow`,
`green`, `teal`, `blue`, `navy`, `purple`, `pink` and `brown`, or `#rrggbb`.

The background belongs to the grid, so a new layout sets it again. A region holds markdown (20,000
characters), an image with `fit` `whole` or `fill`, or a live value: a clock in `HH:mm`, `HH:mm:ss`
or `EEE d MMM`, or a countdown to a time with an optional label. A region cannot hold a page yet,
and a call that sends one gets `PAGE_NOT_BUILT`.

Two record kinds hold a layout and its content, and three tables point at those records:

- `device.layout_set` holds the grid and a short ID. A clear writes one with no grid.
- `device.region_shown` holds one region's content, sealed under the record's own key, with the
  content kind, `until`, the `onEnd` choice and the short ID that `devices.list` shows.
- `device_layouts` points each device at its newest `device.layout_set` record.
- `device_regions` points each region at its newest `device.region_shown` record.
- `device_saved_layouts` holds the layouts saved under a name, one row for each device and name,
  with a random UUID key the assistant never sees. A row holds sequences alone: the sequence of the
  `device.layout_set` record and the sequence of each region's `device.region_shown` record. It
  never holds content.

A new layout writes its record and repoints the device. It deletes the pointer of each region whose
name the grid drops and keeps the pointer of each region whose name it keeps, so a kept region keeps
its content and every other region starts blank. A layout never times out.

### Saved layouts

`device.layout_save` stores the layout the device holds under a name, and a save under a name that
is taken replaces that layout. It writes a `device.layout_saved` record. `device.layout_restore`
puts a layout back in one write transaction: it writes a new `device.layout_set` record with the
saved grid, so a `device.region` call that waited for approval against the layout before the restore
still fails, and points each region at its saved content record. It also writes a
`device.layout_restored` record. `device.layout_remove` deletes a saved layout and writes a
`device.layout_removed` record. None of the three records is erasable.

A saved layout is never a second copy of content, so a forget needs nothing more. A restore leaves a
region blank when a forget erased its content record, and the result lists those regions in
`emptied`. A region whose minutes ran out since the save restores as blank too, because the region
reads its record at the time it is asked. A reset deletes the saved layouts with the layout
pointers, and so does a device removal, which a revoke or a sign-out of the device's session makes.

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
content. Until then the region keeps its content.

## The streams

The device form of [`live.follow`](./live-updates.md#the-stream) takes the screen's size in pixels
and its `pixelRatio`, device pixels per CSS pixel, which the device sends again on each reconnect
and in each `devices.resize`. The server keeps each open stream and its size in memory in
`createDeviceStreams`, which the API's client registry holds. A device is online while it has one
open, and for `deviceOfflineGraceMs` after its last one closes, so a reconnect never reads as
offline. A device that has been offline reports the time its last stream closed, as long as the
process has run since. `devices.resize({ width, height })` gives every open stream of the caller's
device a new size, and `devices.list` reads the new size at once. One pixels schema bounds the size
in both calls. The stream sends `opened` first, then what the screen shows now. A later event
follows a commit that touches the device, and the stream sends an event only when the state changes.
The event of a show carries the `fit` of an image, `whole` or `fill`.

The layout travels in `layout` events, apart from the `show` and `idle` events. A stream sends one
when the device holds a layout, and again when the grid or a region's content changes, a region's
minutes pass or a forget blanks a region. A clear sends a `layout` event with no layout. A stream
that opens on a device with no layout sends no `layout` event. The stream wakes at the earliest end
among the show and the regions, including while a show covers the layout.

`devices.readImage` serves an image only while it is in the current show, the idle scene or a region
of the layout, and returns `NOT_SHOWN` otherwise.

## Waking the model

`devices.watch({ device, wake })` sets the list of changes that wake the model, and each call
replaces the list before it. The list is the newest `device.watch_set` record for that device, and a
device that no call named has an empty list. When a device's change to online or offline is on its
list, the server writes a `device.status_changed` record to the conversation's thread, which the
conversation reads as an inbox record and which wakes a step. A change that the list leaves out
writes nothing. A device counts as offline once it has had no open stream for
`deviceOfflineGraceMs`, so a reconnect inside that time wakes nothing.

## The tools

| Tool                    | What it does                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devices.list`          | Lists each device: `shortID`, name, screen, camera, online, `offlineSinceMs`, `wake`, pixels, `pixelRatio`, what it shows and the layout it holds |
| `devices.watch`         | Sets which changes of a device wake the model: `online`, `offline`, both or none                                                                  |
| `device.show`           | Shows markdown or an image, with `fit` `whole` or `fill`, for `minutes` or until the next show                                                    |
| `device.setIdle`        | Sets the idle scene: up to 8 blocks and 20,000 characters of markdown in all                                                                      |
| `device.layout`         | Sets the grid and its named regions, or clears the layout with `clear: true`                                                                      |
| `device.region`         | Fills one region, for `minutes` with `then` `blank` or `previous`, or until its next call                                                         |
| `device.layout_save`    | Saves the device's layout under a name, replacing a saved layout of that name                                                                     |
| `device.layout_restore` | Puts a saved layout back: its grid and every region's content                                                                                     |
| `device.layouts`        | Lists the saved names, each with the time it was saved                                                                                            |
| `device.layout_remove`  | Deletes a saved layout                                                                                                                            |

All 10 declare the `note` effect and run direct, inside the turn. The user's rules still decide each
call, so an ask rule can hold a call for approval. `device.show` checks in this order and returns
the first refusal: `UNKNOWN_DEVICE`, `SCREEN_OFF`, then the image refusals `UNKNOWN_IMAGE` and
`IMAGE_FORGOTTEN`. A show to an offline device refuses nothing: the show waits, the device shows it
when it comes back online, and the result carries `waiting: true` with a message that says so. The
`minutes` of a show that waits count from the time the device comes online. An image is an
[image store](../connectors/images.md) short ID. `device.layout` returns `UNKNOWN_DEVICE`,
`SCREEN_OFF`, `BAD_LAYOUT` with the reason, then `OFFLINE`. `device.layout_save` returns
`UNKNOWN_DEVICE`, then `NO_LAYOUT` for a device that holds none. `device.layout_restore` returns
`UNKNOWN_DEVICE`, `SCREEN_OFF`, `OFFLINE`, then `UNKNOWN_LAYOUT`. `device.layout_remove` and
`device.layouts` return `UNKNOWN_DEVICE`, and the remove call returns `UNKNOWN_LAYOUT` too. An
`UNKNOWN_LAYOUT` message lists the saved names. `device.region` returns `UNKNOWN_DEVICE`,
`SCREEN_OFF`, `UNKNOWN_REGION`, `PAGE_NOT_BUILT`, the image refusals, then `OFFLINE`.

`devices.list` shows the layout a device holds whether or not the device is online, apart from
`showing`. `showing` follows the screen's order: it is `layout` while no show covers the layout and
at least one region shows content or has a background. Each region lists its kind, `until` and the
short ID of its `device.region_shown` record, and never its content. A blank region has a null kind.

## Device mode

Device mode is the route `/device` of the web client. On load, the page calls
`devices.setCapability` with the screen setting the browser stored, and the answer shows what the
browser holds:

- A browser with no session shows the enrolment form, which makes a device session.
- A browser with a full session and no device row shows a form that names the device and calls
  `devices.register`. The session and its cookie stay as they were, so a chat tab in the same
  browser keeps working.
- A browser with a device row comes back with the screen on or off as it stored, and a button
  switches the screen. A page that registers a device starts with the screen off, whatever the
  browser stored before.

With the screen on, the page opens the device form of `live.follow`. A layout draws as a CSS grid,
and each region keeps its place as another updates. A region with a `background` draws it, with
black or white text, whichever has the higher WCAG contrast ratio on it. Markdown and a live value
grow to the largest size that fits their region, and fit again when the region's size or the text
changes. A clock or a countdown ticks each second from the browser's own time, with no event from
the server. The page renders markdown like a reply and an image on black: `whole` scales it to fit
and centres it, `fill` covers the screen and crops evenly. The page sends `devices.resize` after the
window resizes, at most once per debounce window and only when the size differs from the one the
server has, which each stream connect and each answered resize set, so the assistant reads the new
size within a second.

While the screen is on, the page hides its close, full-screen, screen-off and sign-out buttons until
a touch or a pointer move, and shows them for `revealMs` after the latest one. Close leaves full
screen and device mode, and opens the home page. A button toggles full screen on the page's root
element with the Fullscreen API. Its label reads Full screen or Leave full screen, and follows
`fullscreenchange`, so Escape updates it. The page keeps the screen awake with the Wake Lock API
while a stream is open, and asks for the lock again when the page shows again. The web server sends
the page with a Content-Security-Policy that includes `frame-ancestors 'none'`.
