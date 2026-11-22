# Devices

A device is a browser that shows what the assistant puts on its screen. A browser becomes a device
in one of 2 ways. A browser with no session enrols with a code and a name, and gets a device session
of its own. A browser that is signed in names itself, and the session it holds gets a device row.
The device follows a stream of its own and sends its screen size. The assistant lists devices and
shows markdown or an image on a screen that is on. The camera, the speaker and the microphone are
not built: a device record holds their capabilities, and every one of them stays off.

The `devices` module owns the record, the screen state, the open streams and the tools. The
[API](api.md) owns registration, enrolment and the session scope, and the web client owns device
mode.

## Enrolment and the session scope

A session has a scope, `full` or `device`, stored on `identities` and on `enrolment_codes`. Only a
code carries a scope: `sessions.enrol` takes none, so a device code can't make a full session and a
full code can't make a device session.

A device row belongs to one session, and a session holds at most one. A device session always holds
its row. A full session holds one only after it registers.

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

`devices.follow`, `devices.setCapability`, `devices.readImage` and `devices.resize` act on the
caller's own row. A full session with no row gets `NOT_A_DEVICE`, which says to register first. A
device session whose row a revoke removed gets the refusal of a missing session.

`create-api-app.ts` refuses with 403 each call from a device session except `devices.follow`,
`devices.resize`, `devices.setCapability`, `devices.readImage` and `sessions.signOut`. The test in
`create-device-procedures.test.ts` walks every contract path to keep that list true. A revoke or a
sign-out of a session, full or device, removes its device row and ends its open streams. A full
session's revoke also closes its computer watch sockets. A reset keeps the device rows and clears
what they show.

## The device record

The `devices` table holds a short ID from `createShortID`, the identity, the name, the capabilities
as JSON, and two pointers: `shown_sequence` and `idle_sequence`. Each pointer names the record that
holds what the screen shows:

- `device.shown` holds one show: the content, sealed under the record's own key, and `until`.
- `device.idle_set` holds one idle scene, sealed the same way.
- `device.capability_changed` holds a switch of a capability.

A forget of a `device.shown` or `device.idle_set` record erases the content. The state reader then
drops that content, and an image that is forgotten or missing counts as erased too. The server never
holds the content outside the log.

## The screen state

`readScreenState` reads the two pointed records and `pickScreenState` picks the state: the show,
while it has no `until` or its `until` is ahead, or else the idle scene. A new show replaces the one
before it, and an `until` that passes returns the screen to the idle scene, never to an older show.
An idle device with no scene shows black.

## The streams

`devices.follow` takes the screen's size in pixels, which the device sends again on each reconnect.
The server keeps each open stream and its size in memory in `createDeviceStreams`, and a device is
online while it has one open. `devices.resize({ width, height })` gives every open stream of the
caller's device a new size, within the bounds of `follow`'s size, so `devices.list` reads the new
size at once. The first event is what the screen shows now. A later event follows a commit that
touches the device, and the stream sends an event only when the state changes. The event of a show
carries the `fit` of an image, `whole` or `fill`.

`devices.readImage` serves an image only while it is in the current show or the idle scene, and
returns `NOT_SHOWN` otherwise.

## The tools

| Tool             | What it does                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `devices.list`   | Lists each device: ID, name, screen, camera, online, pixels and what it shows                  |
| `device.show`    | Shows markdown or an image, with `fit` `whole` or `fill`, for `minutes` or until the next show |
| `device.setIdle` | Sets the idle scene: up to 8 blocks and 20,000 characters of markdown in all                   |

All 3 declare the `note` effect and run direct. `device.show` checks in this order and returns the
first refusal: `UNKNOWN_DEVICE`, `SCREEN_OFF`, then the image refusals `UNKNOWN_IMAGE` and
`IMAGE_FORGOTTEN`, then `OFFLINE`. An image is an [image store](../connectors/images.md) short ID.

## Device mode

Device mode is the route `/device` of the web client. The page asks the server to set the screen the
way the device left it, and the answer says what the browser holds:

- A browser with no session shows the enrolment form, which makes a device session.
- A browser with a full session and no device row shows a form that names the device and calls
  `devices.register`. The session and its cookie stay as they were, so a chat tab in the same
  browser keeps working.
- A browser with a device row shows a button that switches the screen on. A page that registers a
  device starts with the screen off, whatever the browser stored before.

With the screen on, the page follows `devices.follow` and renders markdown like a reply and an image
on black: `whole` scales it to fit and centres it, `fill` covers the screen and crops evenly. The
page sends `devices.resize` after the window resizes, at most once every 250 ms and only when the
size differs from the one the server has, which each stream connect and each answered resize set, so
the assistant reads the new size within a second. A button toggles full screen on the page's root
element with the Fullscreen API. Its label reads Full screen or Leave full screen, and follows
`fullscreenchange`, so Escape updates it. The page keeps the screen awake with the Wake Lock API
while a stream is open, and asks for the lock again when the page shows again. The web server sends
the page with a Content-Security-Policy that includes `frame-ancestors 'none'`.
