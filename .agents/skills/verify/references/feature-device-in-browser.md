# device-in-browser

- [Journey](#journey): from a signed-in browser, open the device page in a second tab, name the
  device, switch its screen on, and have the model show a photo.
- [End state](#end-state): what the second tab, the chat tab, the device row and the session show.

Register a signed-in browser as a device with a name and no code. Registering keeps the session and
its cookie, so the chat tab keeps working.

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

   Expect: the page `/device` as tab 1 in `browser tabs`, then the heading "Use this browser as a
   device", the textbox "Device name" and no "Enrolment code" textbox.

3. Name the device, and switch its screen on:

   ```bash
   bun verify browser type --role textbox --name 'Device name' --value 'desk tab'
   bun verify browser click --role button --name 'Register device'
   bun verify browser snapshot
   bun verify browser click --role button --name 'Switch on screen'
   bun verify browser snapshot
   ```

   Expect: the first snapshot shows the button "Switch on screen". The second shows no "Switch on
   screen" button, and no "Switch off screen" or "Full screen" button, because the page hides them
   until a touch.

4. Read the `devices` table and the sessions:

   ```bash
   bun verify db query "select name, capabilities from devices"
   bun verify sessions --device 'hallway tablet'
   ```

   Expect: one `devices` row, "desk tab", whose `capabilities` holds `"screen":true`, and the
   session `hallway tablet` still listed.

5. Have the model show the photo, as `device-screen` does. A shown photo proves the device is
   online, because the model reaches a device only while its page holds a stream:

   ```bash
   bun verify action show-on-device --fit whole --text 'The desk tab shows the photo.'
   bun verify conversation turn --message 'Show this photo on the screen in the hall.' --reply 'The desk tab shows the photo.'
   bun verify browser snapshot
   bun verify db query "select shown_sequence from devices"
   ```

   Expect: `data.replies` above 0 from `show-on-device`, an image named "Picture" in the snapshot
   and a number in `shown_sequence`.

6. Go back to the chat tab, which is tab 0 in `browser tabs`, and send another message:

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

- The second tab showed the registration form and never the enrolment form, and then the screen with
  the photo.
- One `devices` row, "desk tab", has the screen on and a number in `shown_sequence`.
- The session `hallway tablet` is still listed, and the chat tab sent a message after the device
  registered.

Once the end state matches, run `bun verify done`.
