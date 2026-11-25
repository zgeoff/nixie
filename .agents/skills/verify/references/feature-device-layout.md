# device-layout

- [Journey](#journey): enrol a browser as a device and switch its screen on. Have the model lay the
  screen out in 3 regions, update one and let another time out. Have it save the layout, change it
  and restore it. Have it preview the screen, show a page in a region and send the page a message.
  Then install an approved package, and show a page that loads it and reads a declared fetch.
- [End state](#end-state): what the page and the records show.

Run this journey on `local` only. It needs the scripted model and the `layout-on-device` action,
which the harness that runs nixie on `local` serves. On `preview`, list the feature as not verified,
and run no `bun verify done`.

Run this journey last in a pass, after every other journey, `live-updates` included, even though the
features table lists `live-updates` after it. Enrolling a device replaces the browser's session, so
to run another journey after this one, restart and run `sign-in-enrol` again.

Start from a browser with no session, because the device page shows the enrolment form only to such
a browser. Before step 1, run `bun verify up --restart` and `bun verify doctor`, and run no
`sign-in-enrol` between that restart and step 1, because it signs the browser in. Restart the same
way before each repeat of this journey, even after a failed one, because a restart gives nixie a
new, empty database, which holds no session for the browser.

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
   The click is a touch, and shows the buttons for 4 seconds. The last snapshot runs straight after
   the click, so it shows "Close", "Switch off screen", "Full screen" and "Sign out".

4. Have the model replace the text of `note` with "Dentist at 3", and check that the other two keep
   their content:

   ```bash
   bun verify action layout-on-device --step update --text 'The note changed.'
   bun verify conversation turn --message 'Change the note on the screen in the hall.' --reply 'The note changed.'
   bun verify browser snapshot --until-text 'Dentist at 3'
   ```

   Expect: `data.replies` of 3. The snapshot shows "Dentist at 3", "Ripples" and a time, and no
   "Bins go out tonight".

5. Move nixie's clock forward 2 minutes, so the 1 minute of `pond` passes with no wait. Then read
   the region pointers:

   ```bash
   bun verify action advance-clock --minutes 2
   bun verify browser snapshot --until-no-text 'Ripples'
   bun verify browser screenshot
   bun verify db query "select region from device_regions order by region"
   ```

   Expect: `advance-clock` returns `data.minutes` of 2. The snapshot no longer shows "Ripples", and
   still shows "Dentist at 3" and a time. The query lists `clock`, `note` and `pond`, because a
   timed-out region keeps its pointer. nixie checks whether the region's time has passed each time
   it reads the region.

6. Have the model save the layout as `evening`, then read the saved names:

   ```bash
   bun verify action layout-on-device --step save --text 'The layout is saved.'
   bun verify conversation turn --message 'Save the layout of the screen in the hall as evening.' --reply 'The layout is saved.'
   bun verify db query "select name from device_saved_layouts"
   ```

   Expect: `layout-on-device` returns `data.replies` of 3, and `conversation turn` exits 0. The
   query lists one row, `evening`.

7. Have the model lay the screen out again in 2 regions, `note` and `garden`, and fill `garden` on a
   teal background. `note` keeps its text because the new grid keeps the name `note`, and `clock`
   goes because the new grid drops it:

   ```bash
   bun verify action layout-on-device --step change --text 'The layout changed.'
   bun verify conversation turn --message 'Change the layout of the screen in the hall.' --reply 'The layout changed.'
   bun verify browser snapshot --until-text 'Water the pots'
   bun verify browser screenshot
   bun verify db query "select region from device_regions order by region"
   ```

   Expect: `data.replies` of 4. The snapshot shows "Water the pots" and "Dentist at 3", and no time.
   Take the screenshot for the reviewer, who checks the teal background behind "Water the pots". The
   query lists `garden` and `note`.

8. Have the model restore `evening`:

   ```bash
   bun verify action layout-on-device --step restore --text 'The layout is back.'
   bun verify conversation turn --message 'Restore the evening layout of the screen in the hall.' --reply 'The layout is back.'
   bun verify browser snapshot --until-no-text 'Water the pots'
   bun verify browser screenshot
   bun verify db query "select region from device_regions order by region"
   ```

   Expect: `data.replies` of 3. The snapshot shows "Dentist at 3" and a time, and neither "Water the
   pots" nor "Ripples", because the minute of `pond` passed before the save. The query lists `clock`
   and `note`. A save stores no content for a blank region, so `pond` comes back blank with no
   pointer.

9. Have the model preview the screen, then read the call's result:

   ```bash
   bun verify action layout-on-device --step preview --text 'The preview is back.'
   bun verify conversation turn --message 'Show me what the screen in the hall looks like.' --reply 'The preview is back.'
   bun verify db query "select json_extract(res.payload, '$.outcome') as outcome from records call join records res on json_extract(res.payload, '$.callID') = json_extract(call.payload, '$.callID') where call.kind = 'tool_called' and res.kind = 'tool_result' and json_extract(call.payload, '$.tool') = 'device.preview'"
   bun verify model input --contains '\"picture\":\"shown'
   ```

   Expect: `layout-on-device` returns `data.replies` of 3, and `conversation turn` exits 0. The
   query returns one row, with `outcome` `result`. `model input` exits 0: the model's last input
   holds the result with `picture` `shown`. A render that failed still gives the outcome `result`,
   with `picture` `unavailable`, so only `model input` shows that the render worked.

10. Have the model fill `pond` with a page that shows the text of each message it gets and sends the
    message back as an event, then send the page a message:

    ```bash
    bun verify action layout-on-device --step page --text 'The page is up.'
    bun verify conversation turn --message 'Put a page in the pond of the screen in the hall.' --reply 'The page is up.'
    bun verify browser snapshot --until-text 'Waiting'
    bun verify action layout-on-device --step message --text 'The message is sent.'
    bun verify conversation turn --message 'Send the page in the pond of the screen in the hall a message.' --reply 'The message is sent.'
    bun verify browser snapshot --until-text 'Got hello'
    bun verify db query "select json_extract(payload, '$.name') as name, json_extract(payload, '$.region') as region, json_extract(payload, '$.wake') as wake from records where kind = 'device.page_event'"
    bun verify db query "select region from device_regions order by region"
    ```

    Expect: each `layout-on-device` returns `data.replies` of 3, and each `conversation turn`
    exits 0. The first snapshot shows "Waiting", and the second shows "Got hello", because the page
    ran in its frame and read the message. The query returns one row: `echo`, `pond` and `0`, the
    event the page sent back, which woke nothing. The region query lists `clock`, `note` and `pond`,
    because the page gave `pond` a pointer again. When a snapshot does not list the text inside the
    frame, take a screenshot and read the page from it.

11. Have the model ask for the package `ripple-count` 1.0.0, and approve it as the user would. The
    install runs in full: nixie reads the registry's document, the user approves the card, and the
    fetch sandbox downloads the tarball, checks its hash and unpacks it. The registry is a test site
    on a loopback address. The approval takes a passkey, which a journey cannot give, so approve
    with the action `--step approve-install`, which answers as nixie's host command does:

    ```bash
    bun verify action layout-on-device --step install --text 'The package is asked for.'
    bun verify conversation turn --message 'Get the ripple counter package approved for the pages.' --reply 'The package is asked for.'
    bun verify proposals --tool device.addPackage --waiting pending
    bun verify action layout-on-device --step approve-install --text 'Approved.'
    bun verify db query "select name, version from device_packages"
    ```

    Expect: `data.replies` of 2 from the first action, and `conversation turn` exits 0. `proposals`
    exits 0. The approve action returns `data.replies` of 1, once the package is stored. The query
    returns one row: `ripple-count` and `1.0.0`.

12. Have the model show a page in `pond` that loads the approved package and reads the declared
    fetch of `https://tides.test/today`, which the test site serves. nixie holds the model's
    `device.region` call, because no rule allows the host `tides.test`. The approvals page refuses
    the browser's device session, so give the user's answer with the action `--step approve`. Script
    the model's text for the turn that the approval starts with `action script-reply` first:

    ```bash
    bun verify action layout-on-device --step package --text 'The tide page is up.'
    bun verify conversation turn --message 'Put the tide page in the pond of the screen in the hall.' --reply 'The tide page is up.'
    bun verify proposals --tool device.region --waiting pending
    bun verify action script-reply --text 'Thanks, I have your answer.'
    bun verify action layout-on-device --step approve --text 'Approved.'
    bun verify proposals --tool device.region --waiting none
    bun verify browser snapshot --until-text 'Tide 14:05'
    bun verify browser screenshot
    ```

    Expect: `data.replies` of 3 from the first action, and `conversation turn` exits 0. `proposals`
    exits 0. The approve action returns `data.replies` of 1. The snapshot shows "Tide 14:05 ripples
    7": the page loaded the package's script, which set `ripples` to 7, and read the declared fetch
    from the test site. When the snapshot does not list the text inside the frame, read it from the
    screenshot. A page that shows "Failed" and a code means the fetch was refused or not ready: skip
    `done`, and report the code.

## End state

- The snapshot of step 8 shows "Dentist at 3" and a time, and no "Ripples", no "Water the pots" and
  no "Bins go out tonight".
- After step 8, `device_regions` holds 2 rows, `clock` and `note`, the regions of the restored
  layout that hold content. After step 10 it holds 3, `clock`, `note` and `pond`.
- `device_saved_layouts` holds the one row, `evening`.
- In step 9, the model's one call of `device.preview` returned a result with `picture` `shown`.
- In step 10, the page in `pond` shows "Got hello", and `records` holds one `device.page_event`
  named `echo`.
- After step 11, `device_packages` holds one row, `ripple-count`. In step 12, the page in `pond`
  shows "Tide 14:05 ripples 7".
- Take the screenshots for the reviewer, and check nothing in them, except to read the page's text
  in step 10 or 12 when its snapshot does not list it.

Once the end state matches, run `bun verify done`.
