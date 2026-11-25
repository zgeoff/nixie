# device-screen

- [Journey](#journey): enrol a browser as a device, switch its screen on, and have the model show a
  photo.
- [End state](#end-state): what the page, the device row and the records show.

Run this journey on `local` only, after every other journey. It needs the scripted model and the
`show-on-device` action, which the harness that runs nixie on `local` serves. On `preview`, list the
feature as not verified, and run no `bun verify done`.

Start from a browser with no session, because the device page shows the enrolment form only to such
a browser. Run `bun verify up --restart` and `bun verify doctor`. Skip `sign-in-enrol`, which signs
the browser in. Enrolling replaces the browser's session, so a journey after this one needs a new
restart and a `sign-in-enrol` run. Restart the same way before each repeat of this journey, even
after a failed one: a restart gives nixie a new, empty database.

A device is a browser that shows what the model puts on its screen. You enrol it on the page
`/device`, with a code from `nixie enrol-code device`.

## Journey

1. Record the next commands under this feature. Start the `enrol-device-code` terminal, which runs
   `nixie enrol-code device`, and wait for the code it prints:

   ```bash
   bun verify use --feature device-screen
   bun verify terminal start enrol-device-code
   bun verify terminal wait --regex '[A-Z0-9]{5}-[A-Z0-9]{5}'
   ```

   Expect: the first match of the regex in `data.screen.text` is the code.

2. Open the device page, and enrol. Put the code from step 1 in place of `<code>`:

   ```bash
   bun verify browser goto /device
   bun verify browser snapshot
   bun verify browser type --role textbox --name 'Enrolment code' --value '<code>'
   bun verify browser type --role textbox --name 'Device name' --value 'hall display'
   bun verify browser click --role button --name Enrol
   bun verify browser snapshot
   ```

   Expect: the first snapshot shows the heading "Enrol this browser". The last shows the button
   "Switch on screen" and no such heading.

3. Switch the screen on, and read the `devices` table:

   ```bash
   bun verify browser click --role button --name 'Switch on screen'
   bun verify browser snapshot
   bun verify db query "select name, capabilities from devices"
   ```

   Expect: no button "Switch on screen", and none of the buttons "Switch off screen", "Full screen"
   and "Sign out", because the page hides them until a touch. One row, "hall display", whose
   `capabilities` holds `"screen":true`.

4. Have the model show the photo, once for each `--fit` value. `whole` shows all of the picture and
   `fill` covers the screen. The action sends the user's message with a photo, always with the text
   below, and queues the model turn that shows it. Copy the `conversation turn` message as written,
   and give both commands the same reply:

   ```bash
   bun verify action show-on-device --fit whole --text 'The hall display shows the photo.'
   bun verify conversation turn --message 'Show this photo on the screen in the hall.' --reply 'The hall display shows the photo.'
   ```

   Run both commands again with `--fit fill`. Expect: each `show-on-device` returns `data.replies`
   above 0, the count of scripted model replies it queued, and each `conversation turn` exits 0.

5. Read the page and the device row:

   ```bash
   bun verify browser click --role img --name Picture
   bun verify browser snapshot
   bun verify browser screenshot
   bun verify db query "select shown_sequence from devices"
   ```

   The click is a touch, which shows the buttons for 4 seconds. Run the snapshot straight after it.
   Expect: the end state below.

## End state

- The snapshot of step 5 lists an image named "Picture" above the buttons.
- `shown_sequence` of the device is a number, never null.
- The screenshot is evidence for the reviewer. Check nothing in it.

Once the end state matches, run `bun verify done`.
