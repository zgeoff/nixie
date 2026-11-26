# device-in-browser

- [Journey](#journey): from a signed-in browser, open the device page in a second tab, see the
  browser's own device full screen with no registration, and have the model show a photo.
- [End state](#end-state): what the second tab, the chat tab, the device row and the session show.

Every signed-in browser is a client device from its enrolment, so the device page, `/device`, asks
for no name and no code. It shows that device full screen, with the screen on.

Run this journey on `local` only, before `device-screen`. It needs the scripted model and the
`show-on-device` action, which the harness that runs nixie on `local` serves. On `preview`, list the
feature as not verified, and run no `bun verify done`.

Run [sign-in-enrol](feature-sign-in-enrol.md) first, and type the device name `hallway tablet`. This
journey leaves the browser with a session, so run `bun verify up --restart` before `device-screen`,
which needs a browser with no session.

## Journey

1. Record the next commands under this feature. Queue a model reply with a link to the device page,
   then send the message that gets it. A link in a reply opens in a new tab:

   ```bash
   bun verify use --feature device-in-browser
   bun verify action script-reply --text 'Open [the device page](/device) in a new tab.'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Where is the device page?'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Where is the device page?' --reply 'Open [the device page](/device) in a new tab.'
   ```

   Expect: exit 0 from each command.

2. Open the link, which makes the second tab, and read the page:

   ```bash
   bun verify browser click --role link --name 'the device page'
   bun verify browser tabs
   bun verify browser tab 1
   bun verify browser snapshot
   ```

   Expect: the page `/device` as tab 1 in `browser tabs`. The snapshot holds no heading "Use this
   browser as a device", no "Enrolment code" textbox and no "Switch on screen" button, because the
   screen is already on. It holds no "Switch off screen" or "Full screen" button either, because the
   page hides them until a touch.

3. Read the `devices` table and the sessions:

   ```bash
   bun verify db query "select name, device_kind, capabilities from devices where name = 'hallway tablet'"
   bun verify sessions --device 'hallway tablet'
   ```

   Expect: one `devices` row, "hallway tablet", whose `device_kind` is `client` and whose
   `capabilities` holds `"screen":true`, and the session `hallway tablet` listed.

4. Have the model show a photo on the browser's device, as `device-screen` does for a device that
   enrolled with a code. The harness's own session is a client device too, so name the device. A
   shown photo proves the device is online, because the model reaches a device only while a page of
   its browser holds a stream:

   ```bash
   bun verify action show-on-device --device 'hallway tablet' --fit whole --text 'The hallway tablet shows the photo.'
   bun verify conversation turn --message 'Show this photo on the screen in the hall.' --reply 'The hallway tablet shows the photo.'
   bun verify browser snapshot
   bun verify db query "select shown_sequence from devices where name = 'hallway tablet'"
   ```

   Expect: `data.replies` above 0 from `show-on-device`, an image named "Picture" in the snapshot
   and a number in `shown_sequence`.

5. Go back to the chat tab, which is tab 0 in `browser tabs`, and send another message:

   ```bash
   bun verify action script-reply --text 'The chat tab still works.'
   bun verify browser tab 0
   bun verify browser type --role textbox --name Message --value 'Still there?'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Still there?' --reply 'The chat tab still works.'
   bun verify browser snapshot
   ```

   Expect: exit 0 from each command, and the reply "The chat tab still works." in the snapshot.

## End state

- The second tab never showed a registration or an enrolment form, and then showed the screen with
  the photo.
- One `devices` row, "hallway tablet", of kind `client`, has the screen on and a number in
  `shown_sequence`.
- The session `hallway tablet` is still listed, and the chat tab sent a message after the device
  page opened.

Once the end state matches, run `bun verify done`.
