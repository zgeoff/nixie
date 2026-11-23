# device-layout

- [Journey](#journey): enrol a browser as a device, switch its screen on, and have the model lay it
  out in 3 regions, update one and let another time out.
- [End state](#end-state): what the page and the records show.

Run this journey on `local` only, after every other journey. It needs the scripted model and the
`layout-on-device` action, which the harness that runs nixie on `local` serves. On `preview`, list
the feature as not verified, and run no `bun verify done`.

Start from a browser with no session, because the device page shows the enrolment form only to such
a browser. Run `bun verify up --restart` and `bun verify doctor`. Skip `sign-in-enrol`, which signs
the browser in. Enrolling replaces the browser's session, so a journey after this one needs a new
restart and a `sign-in-enrol` run. Restart the same way before each repeat of this journey, even
after a failed one: a restart gives nixie a new, empty database.

A layout is a grid of named regions on a device's screen. Each region shows its own content, and the
model updates or times out one region with no change to the others.

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
   bun verify browser snapshot --until-text 'Switch off screen'
   ```

   Expect: the buttons "Switch off screen" and "Sign out".

3. Have the model lay out the screen in 3 regions and fill each one. The first region holds the text
   "Ripples" for 1 minute, the second holds "Bins go out tonight", and the third holds a clock. Copy
   the `conversation turn` message as written:

   ```bash
   bun verify action layout-on-device --step set --text 'The screen is laid out.'
   bun verify conversation turn --message 'Lay out the screen in the hall.' --reply 'The screen is laid out.'
   bun verify browser snapshot --until-text 'Bins go out tonight'
   bun verify browser screenshot
   ```

   Expect: `layout-on-device` returns `data.replies` of 6, and `conversation turn` exits 0. The
   snapshot shows "Ripples", "Bins go out tonight" and a time such as `14:05`.

4. Have the model update the second region, and check that the other two keep their content:

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

## End state

- The last snapshot shows "Dentist at 3" and a time, and no "Ripples" and no "Bins go out tonight".
- `device_regions` holds 3 rows, one for each region.
- The screenshots are evidence for the reviewer. Check nothing in them.

Once the end state matches, run `bun verify done`.
