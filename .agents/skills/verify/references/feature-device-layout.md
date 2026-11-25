# device-layout

- [Journey](#journey): enrol a browser as a device, switch its screen on, and have the model lay it
  out in 3 regions, update one, let another time out, then save the layout, change it and restore
  it.
- [End state](#end-state): what the page and the records show.

Run this journey on `local` only. Run all of it last, after every other journey, `live-updates`
included, though the features table lists `live-updates` after it: enrolling a device replaces the
browser's session (see below). It needs the scripted model and the `layout-on-device` action, which
the harness that runs nixie on `local` serves. On `preview`, list the feature as not verified, and
run no `bun verify done`.

Start from a browser with no session, because the device page shows the enrolment form only to such
a browser. Before step 1, run `bun verify up --restart` and `bun verify doctor`, and do not run
`sign-in-enrol` first, because it signs the browser in. This journey is the last one of a pass. To
run another journey after it, restart and run `sign-in-enrol` again. Restart the same way before
each repeat of this journey, even after a failed one: a restart gives nixie a new, empty database,
which holds no session for the browser.

A layout is a grid of named regions on a device's screen. Each region shows its own content, and the
model updates or times out one region with no change to the others. The model can also save a layout
under a name, lay the screen out again, and restore the saved layout in one call.

## Journey

1. Record the next commands under this feature. Start the `enrol-device-code` terminal, which runs
   `nixie enrol-code device`, and wait for the code it prints:

   ```bash
   bun verify use --feature device-layout
   bun verify terminal start enrol-device-code
   bun verify terminal wait --regex '[A-Z0-9]{5}-[A-Z0-9]{5}'
   ```

   Expect: the first match of the regex in `data.screen.text` is the code.

2. Open the device page, enrol, and switch the screen on. Put the code from step 1 in place of
   `<code>`:

   ```bash
   bun verify browser goto /device
   bun verify browser type --role textbox --name 'Enrolment code' --value '<code>'
   bun verify browser type --role textbox --name 'Device name' --value 'hall display'
   bun verify browser click --role button --name Enrol
   bun verify browser click --role button --name 'Switch on screen'
   bun verify browser snapshot
   ```

   Expect: no button "Switch on screen", and no button "Close", "Switch off screen" or "Sign out",
   because the page hides them until a touch.

3. Have the model lay out the screen in 3 regions and fill each one. The region `pond` holds the
   text "Ripples" for 1 minute, `note` holds "Bins go out tonight", and `clock` holds a clock. Copy
   the `conversation turn` message as written:

   ```bash
   bun verify action layout-on-device --step set --text 'The screen is laid out.'
   bun verify conversation turn --message 'Lay out the screen in the hall.' --reply 'The screen is laid out.'
   bun verify browser snapshot --until-text 'Bins go out tonight'
   bun verify browser screenshot
   bun verify browser click --text 'Bins go out tonight'
   bun verify browser snapshot
   ```

   Expect: `layout-on-device` returns `data.replies` of 6, and `conversation turn` exits 0. The
   first snapshot shows "Ripples", "Bins go out tonight" and a time such as `14:05`, and no buttons.
   The click is a touch, which shows the buttons for 4 seconds, so the last snapshot, run straight
   after it, shows "Close", "Switch off screen", "Full screen" and "Sign out".

4. Have the model replace the text of `note` with "Dentist at 3", and check that the other two keep
   their content:

   ```bash
   bun verify action layout-on-device --step update --text 'The note changed.'
   bun verify conversation turn --message 'Change the note on the screen in the hall.' --reply 'The note changed.'
   bun verify browser snapshot --until-text 'Dentist at 3'
   ```

   Expect: `data.replies` of 3. The snapshot shows "Dentist at 3", "Ripples" and a time, and no
   "Bins go out tonight".

5. Move nixie's clock forward 2 minutes, so the first region's minute passes with no wait. Then read
   the region pointers:

   ```bash
   bun verify action advance-clock --minutes 2
   bun verify browser snapshot --until-no-text 'Ripples'
   bun verify browser screenshot
   bun verify db query "select region from device_regions order by region"
   ```

   Expect: `advance-clock` returns `data.minutes` of 2. The snapshot no longer shows "Ripples", and
   still shows "Dentist at 3" and a time. The query lists `clock`, `note` and `pond`: a timed-out
   region keeps its pointer, and the server reads that its minutes passed.

6. Have the model save the layout as `evening`, then read the saved names:

   ```bash
   bun verify action layout-on-device --step save --text 'The layout is saved.'
   bun verify conversation turn --message 'Save the layout of the screen in the hall as evening.' --reply 'The layout is saved.'
   bun verify db query "select name from device_saved_layouts"
   ```

   Expect: `layout-on-device` returns `data.replies` of 3, and `conversation turn` exits 0. The
   query lists one row, `evening`.

7. Have the model lay the screen out again in 2 regions, `note` and `garden`, the second on a teal
   background, and fill `garden`. `note` keeps its text, because the new grid keeps its name, and
   `clock` goes, because it does not:

   ```bash
   bun verify action layout-on-device --step change --text 'The layout changed.'
   bun verify conversation turn --message 'Change the layout of the screen in the hall.' --reply 'The layout changed.'
   bun verify browser snapshot --until-text 'Water the pots'
   bun verify browser screenshot
   bun verify db query "select region from device_regions order by region"
   ```

   Expect: `data.replies` of 4. The snapshot shows "Water the pots" and "Dentist at 3", and no time.
   The screenshot shows the teal background behind "Water the pots". The query lists `garden` and
   `note`.

8. Have the model restore `evening`:

   ```bash
   bun verify action layout-on-device --step restore --text 'The layout is back.'
   bun verify conversation turn --message 'Restore the evening layout of the screen in the hall.' --reply 'The layout is back.'
   bun verify browser snapshot --until-no-text 'Water the pots'
   bun verify browser screenshot
   bun verify db query "select region from device_regions order by region"
   ```

   Expect: `data.replies` of 3. The snapshot shows "Dentist at 3" and a time, and no "Water the
   pots" and no "Ripples", because the minute of `pond` passed before the save. The query lists
   `clock`, `note` and `pond`.

## End state

- The last snapshot shows "Dentist at 3" and a time, and no "Ripples", no "Water the pots" and no
  "Bins go out tonight".
- `device_regions` holds 3 rows, one for each region of the restored layout.
- `device_saved_layouts` holds the one row, `evening`.
- The screenshots are evidence for the reviewer. Check nothing in them.

Once the end state matches, run `bun verify done`.
