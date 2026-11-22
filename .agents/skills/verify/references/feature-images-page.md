# images-page

Contents: [Journey](#journey), [End state](#end-state).

The images page at `/images` lists the stored images, newest first. It shows pinned images until the
user ticks "Show all". A tap on an image opens a lightbox with its name, its prompt, when it was
made and, for an edit, a link to the image it was edited from. A forget in the lightbox takes the
whole image: its picture, its prompt and its name.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. On `local`, the test build answers each image call with a stub, so
no image provider is called and nothing is billed. `preview` has no image provider. There, skip this
journey and run no `done`. In your reply, list the feature as not verified on `preview`.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Step 2 expects 2 rows in the `images` table.
- Before you run the journey again, even after a failed pass, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol. `up --restart` starts nixie on a new, empty database.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn.
   `--draw` queues 2 `image.draw` calls, a new image and an edit of it, and `--text` queues the
   reply that follows them. Neither image is pinned, so the page shows none until "Show all".

   ```bash
   bun verify use --feature images-page
   bun verify action script-reply --draw '{"prompt":"A heron standing in a pond at dawn.","edit":"Make the sky pink."}' --text 'Here are the heron and its pink-sky edit.'
   ```

   Expect: `data.replies` above 0.

2. Send the message, and check that nixie stored both images:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Draw me a heron, then make the sky pink.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Draw me a heron, then make the sky pink.' --reply 'Here are the heron and its pink-sky edit.'
   bun verify db query "select image_id, parent_id from images order by created_at, rowid"
   ```

   Expect: `conversation turn` exits 0, and `data.rowCount` is 2. The second row's `parent_id` is
   the first row's `image_id`. Call the rows `<first>` and `<second>`.

3. Open the images page, and tick "Show all":

   ```bash
   bun verify browser goto /images
   bun verify browser snapshot
   bun verify browser check --role checkbox --name 'Show all'
   bun verify browser snapshot --until-text 'Open <second>'
   ```

   Expect: the first snapshot shows the heading "Images", the unticked checkbox "Show all" and the
   text "No image is pinned". The last shows the ticked checkbox and 2 buttons whose names start
   with "Open".

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
   bun verify db query "select count(*) as forgotten from records where kind = 'record.forgotten'"
   bun verify browser goto '/images?all=true'
   bun verify browser snapshot
   ```

   Expect: the first snapshot shows the text "Forgotten" in place of the picture and a line that
   starts with "Key backups". The query's `forgotten` is 2, one for the image's call record and one
   for its result record. The last snapshot lists one button, "Open <second>".

## End state

- Step 2: the `images` table holds 2 rows, and the second row's `parent_id` is the first row's
  `image_id`.
- Step 3: with "Show all" unticked, the page lists no image and says that no image is pinned. With
  it ticked, the page lists both images.
- Step 4: the lightbox of the edit shows "Edited from" and a link named for the first image. The
  link opens the first image's lightbox.
- Step 5: the lightbox shows "Forgotten" and a "Key backups" line, the call and result records of
  the first image are forgotten, and the grid lists the edit alone.
