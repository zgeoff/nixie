# drawing

Contents: [Journey](#journey), [End state](#end-state).

The user asks for an image, and nixie draws it with the `image.draw` tool. The user asks for one
change, and nixie calls `image.draw` again with `from` set to the first image's ID, which edits that
image. nixie stores each image in the `images` table, and the `image.list` tool lists both. The
conversation page groups the turn's tool calls under "Tools", followed by the number of calls.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. On `local`, the test build answers each image call with a stub, so
no image provider is called and nothing is billed. `preview` has no image provider. There, skip this
journey and run no `done`. In your reply, list the feature as not verified on `preview`.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`. Step 3 expects 2 rows in the `images` table.
- Before you run the journey again, even after a failed pass, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol. `up --restart` starts nixie on a new, empty database.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn.
   `--draw` queues 4 tool calls: `image.draw` with the `prompt`, `image.draw` with the `edit` text
   as its prompt and `from` set to the first image, `image.list`, and `file.send` of the image that
   the list names last. `--text` queues the reply that follows them.

   ```bash
   bun verify use --feature drawing
   bun verify action script-reply --draw '{"prompt":"A heron standing in a pond at dawn.","edit":"Make the sky pink.","send":true}' --text 'Here are the heron and its pink-sky edit.'
   ```

   Expect: `data.replies` is 5, the 4 tool calls and the reply.

2. Send the message. `conversation turn` waits up to 10 s for the message and the reply in the event
   log.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Draw me a heron, then make the sky pink.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Draw me a heron, then make the sky pink.' --reply 'Here are the heron and its pink-sky edit.'
   ```

   Expect: `conversation turn` exits 0. On a failure, do what its row in [Exit codes](exit-codes.md)
   says.

3. Check that nixie stored both images, and that the second came from the first:

   ```bash
   bun verify db query "select image_id, parent_id, source from images order by created_at, rowid"
   ```

   Expect: `data.rowCount` is 2. Both rows have `source` `draw`, because an edit is a draw with
   `from`. The first row has `parent_id` `null`. The second row's `parent_id` is the first row's
   `image_id`.

4. Open the turn's tool calls on the page. Each snapshot gives every element a new `ref`, so take
   each `ref` from the snapshot just before its click.
   - In the first snapshot, the turn is one collapsed line. Its text starts with "conversation" and
     holds "image draw:", and it has `[cursor=pointer]`. Pass its `ref` as `<turn_ref>`.
   - In the second snapshot, find the line that starts with `group "Tools 4"`. Pass its `ref` as
     `<tools_ref>`.

   ```bash
   bun verify browser snapshot
   bun verify browser click --ref '<turn_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<tools_ref>'
   bun verify browser snapshot
   ```

   Expect: every command exits 0. The last snapshot is the evidence for the end state.

## End state

- Step 3: the `images` table holds 2 rows. The second row's `parent_id` is the first row's
  `image_id`.
- The last snapshot of step 4 lists 4 tool calls under "Tools 4", in this order:
  - `image.draw`, with the input `{ "prompt": "A heron standing in a pond at dawn." }`. Its result
    has `"image"` set to the first row's `image_id`, `"from": null`, `"profile": "openai"` and
    `"model": "image-test-1"`.
  - `image.draw`, with the input `{ "prompt": "Make the sky pink.", "from": "<first image_id>" }`.
    Its result has `"image"` set to the second row's `image_id`, `"from"` set to the first row's,
    and `"model": "image-test-1"`.
  - `image.list`, with the input `{}`. Its result has an `images` list of 2 entries. The first
    entry's `image` is the second row's `image_id`, and the second entry's `image` is the first
    row's.
  - `file.send`, with the input `{ "file": "<first image_id>" }`.
- In the same snapshot, the "Conversation" list ends with an item that has the label "nixie" and the
  text "Here are the heron and its pink-sky edit.". An image named `<first image_id>.png` follows
  that item, with its size under it.
