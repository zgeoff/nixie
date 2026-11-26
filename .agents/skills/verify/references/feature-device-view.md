# device-view

- [Journey](#journey): from a signed-in browser, open the Device view from the menu, have the model
  show a photo while the chat shows, then open the Device view again.
- [End state](#end-state): what the Device view, the chat and the device row show.

The Device view is a page of the app, opened by hand from the menu as the Computer page is. It draws
the browser's own device at the size of the page's content area. The app shows no pop-up, badge or
notice when the assistant puts something on the device, so the photo appears only when the user
opens the page.

Run this journey on `local` only, after [device-in-browser](feature-device-in-browser.md). It needs
the scripted model and the `show-on-device` action, which the harness that runs nixie on `local`
serves. On `preview`, list the feature as not verified, and run no `bun verify done`.

Run [sign-in-enrol](feature-sign-in-enrol.md) first as set-up, and type the device name
`hallway tablet`. It is not part of this journey. When `device-in-browser` ran before, run
`bun verify up --restart` and `bun verify doctor`, and sign in again.

## Journey

1. Record the next commands under this feature, and open the Device view from the menu:

   ```bash
   bun verify use --feature device-view
   bun verify browser goto /
   bun verify browser click --role link --name 'Device view'
   bun verify browser snapshot
   ```

   Expect: the snapshot holds the region "Device view", and no image, no alert and no dialog.

2. Go back to the chat, and have the model show a photo:

   ```bash
   bun verify browser click --role link --name Conversation
   bun verify action show-on-device --device 'hallway tablet' --fit whole --text 'The hallway tablet shows the photo.'
   bun verify conversation turn --message 'Show this photo on the screen in the hall.' --reply 'The hallway tablet shows the photo.'
   bun verify browser snapshot
   ```

   Expect: `data.replies` above 0 from `show-on-device`. The snapshot holds the reply "The hallway
   tablet shows the photo." and no dialog, no alert and no region "Device view", so nothing on the
   page tells the user about the photo.

3. Open the Device view again:

   ```bash
   bun verify browser click --role link --name 'Device view'
   bun verify browser snapshot
   bun verify db query "select name, device_kind, shown_sequence from devices where name = 'hallway tablet'"
   ```

   Expect: the snapshot holds the region "Device view" with an image named "Picture". The query
   returns one row, "hallway tablet", of kind `client`, with a number in `shown_sequence`.

## End state

- The Device view opened from the menu, and showed the photo only after the user opened it again.
- The chat showed no notice of the photo while the photo arrived.
- One `devices` row, "hallway tablet", of kind `client`, holds the photo as what it shows.

Once the end state matches, run `bun verify done`.
