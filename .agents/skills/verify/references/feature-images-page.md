# images-page

Contents: [Journey](#journey), [End state](#end-state).

The images page at `/images` lists the stored images, newest first. It shows pinned images until the
user ticks "Show all". A tap on an image opens a lightbox with its name, its prompt, when it was
made and, for an edit, a link to the image it was edited from. A forget in the lightbox takes the
whole image: its picture, its prompt and its name.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. On `local`, the test build answers each image call with a stub, so
no image provider is called and nothing is billed. `preview` holds only a placeholder image key, so
no image call works there. On `preview`, skip this journey and run no `done`. In your reply, list
the feature as not verified on `preview`.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. It may run after [drawing](feature-drawing.md), which leaves 2
  images of its own: the journey reads only the 2 newest rows of the `images` table.
- Before you run the journey again, even after a failed pass, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol. `up --restart` starts nixie on a new, empty database.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn.
   `--draw` queues 2 `image.draw` calls, a new image and an edit of it, then an `image.list` call,
   and `--text` queues the reply that follows them. Neither image is pinned, so the page shows none
   until "Show all".

   ```bash
   bun verify use --feature images-page
   bun verify action script-reply --draw '{"prompt":"A heron standing in a pond at dawn.","edit":"Make the sky pink."}' --text 'The heron and its edit are in the gallery.'
   ```

   Expect: `data.replies` above 0.

2. Send the message, and check that nixie stored both images:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Draw a heron for the gallery, then make the sky pink.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Draw a heron for the gallery, then make the sky pink.' --reply 'The heron and its edit are in the gallery.'
   bun verify db query "select image_id, parent_id from images order by created_at desc, rowid desc limit 2"
   ```

   Expect: `conversation turn` exits 0, and `data.rowCount` is 2. The query lists the newest row
   first, and its `parent_id` is the other row's `image_id`. Call the newest row `<second>`, the
   edit, and the other `<first>`.

3. Open the images page, and tick "Show all":

   ```bash
   bun verify browser goto /images
   bun verify browser snapshot
   bun verify browser check --role checkbox --name 'Show all'
   bun verify browser snapshot --until-text 'Open <second>'
   ```

   Expect: the first snapshot shows the heading "Images", the unticked checkbox "Show all" and the
   text "No image is pinned". The last shows the ticked checkbox and the buttons "Open <first>" and
   "Open <second>", and the buttons of any earlier journey's images.

4. Open the second image, which is the edit, and follow its edit link:

   ```bash
   bun verify browser click --role button --name 'Open <second>'
   bun verify browser snapshot
   bun verify browser click --role link --name '<first>'
   bun verify browser snapshot
   bun verify browser screenshot
   ```

   Expect: the first snapshot shows a dialog with the prompt "Make the sky pink." and the text
   "Edited from". The last shows the same dialog with the prompt "A heron standing in a pond at
   dawn." and no "Edited from" text. The screenshot is evidence for the reviewer.

5. Forget the first image from its lightbox, and check what is left:

   ```bash
   bun verify browser click --role button --name Forget
   bun verify browser click --role button --name 'Forget for good'
   bun verify browser snapshot --until-text 'Key backups'
   bun verify db query "select json_extract(payload, '$.kind') as target, count(*) as finished from records where kind = 'erasure.finished' group by target"
   bun verify browser goto '/images?all=true'
   bun verify browser snapshot
   ```

   Expect: the first snapshot shows the text "Forgotten" in place of the picture and a line that
   starts with "Key backups". The query lists 1 finished erasure of the target `image` and 3 of the
   target `record`: the image's call record, its result record, and the result of the `image.list`
   call that `--draw` queues, which quotes the image's prompt. The last snapshot lists the button
   "Open <second>" and no button "Open <first>".

## End state

- Step 2: the 2 newest rows of the `images` table are the journey's: the newest row's `parent_id` is
  the other row's `image_id`.
- Step 3: with "Show all" unticked, the page lists no image and shows "No image is pinned". With it
  ticked, the page lists both images of the journey.
- Step 4: the lightbox of the edit shows "Edited from" and a link named for the first image. The
  link opens the first image's lightbox.
- Step 5: the lightbox shows "Forgotten" and a "Key backups" line, the call and result records of
  the first image and the list result that quotes it are forgotten, and the grid lists the edit but
  not the first image.
