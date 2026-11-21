# device-screen

- [Journey](#journey): enrol a browser as a device, switch its screen on, and have the model show a
  photo.
- [End state](#end-state): what the page, the device row and the records show.

A device is a browser that shows what the model puts on its screen. It enrols with a code from
`nixie enrol-code device`, on the page `/device`, and its session reaches only its own stream. The
owner switches the screen on there, and the model then shows a picture on it with `device.show`.

Run this journey on `local` only. It needs the scripted model, and the `show-on-device` action,
which sends the owner's photo from the harness that runs nixie on `local`. List the feature as not
verified on `preview`.

Run it on a browser with no session: the device page shows the enrolment form only to such a
browser, and enrolling a device replaces the session the browser held. Run `bun verify up --restart`
and `bun verify doctor` first when an earlier journey signed this browser in.

## Journey

1. Record the next commands under this feature, and get a device code from the target's terminal.
   Wait for the code it prints:

   ```bash
   bun verify use --feature device-screen
   bun verify terminal start enrol-device-code
   bun verify terminal wait --regex '[A-Z0-9]{5}-[A-Z0-9]{5}'
   ```

   Expect: the first match of the regex in `data.screen.text` is the code.

2. Open the device page, and enrol. Put the code from step 1 in place of `<code>`:

   ```bash
   bun verify browser goto /device
   bun verify browser type --role textbox --name 'Enrolment code' --value '<code>'
   bun verify browser type --role textbox --name 'Device name' --value 'hall display'
   bun verify browser click --role button --name Enrol
   bun verify browser snapshot
   ```

   Expect: the button "Switch on screen", and no "Enrol this browser" heading.

3. Switch the screen on, and check that the device is on the list:

   ```bash
   bun verify browser click --role button --name 'Switch on screen'
   bun verify browser snapshot
   bun verify db query "select name, capabilities from devices"
   ```

   Expect: the buttons "Switch off screen" and "Sign out", and one row, "hall display", whose
   `capabilities` holds `"screen":true`.

4. Send the owner's photo, and have the model show it. `--fit whole` shows all of the picture, and
   `--fit fill` covers the screen. The command queues the model's turn, so run it once per fit:

   ```bash
   bun verify action show-on-device --fit whole --text 'The hall display shows the photo.'
   bun verify conversation turn --message 'Show this photo on the screen in the hall.' --reply 'The hall display shows the photo.'
   ```

5. Read the page and the device row:

   ```bash
   bun verify browser snapshot
   bun verify browser screenshot
   bun verify db query "select shown_sequence from devices"
   ```

## End state

- `conversation turn` exited 0.
- The snapshot of step 5 lists an image named "Picture" above the buttons.
- `shown_sequence` of the device is a number, not null.
