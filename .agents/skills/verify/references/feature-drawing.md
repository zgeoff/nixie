# drawing

Contents: [Journey](#journey), [End state](#end-state).

The user asks for a picture, and nixie draws it with the `image.draw` tool. The user asks for one
change, and nixie edits the picture with `image.draw` again, with `from` set to the first picture's
ID. nixie stores each picture in the `images` table, and the `image.list` tool lists both. The
conversation page shows each call under the turn's "Tools" group.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only:

- On `local`, the test build answers each image call with a stub, so no image provider is called and
  nothing is billed.
- The image provider belongs to the deployment's config, which `preview` lacks. On `preview`, skip
  this journey, and list the feature as not verified there in your reply.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`: step 3 expects exactly 2 rows in the `images` table. Before a
  second pass, run `bun verify up --restart` and `bun verify doctor`, then sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature. Then script the model's next turn:
   it draws a picture, edits that picture, lists its pictures, then replies.

   ```bash
   bun verify use --feature drawing
   bun verify action script-reply --draw '{"prompt":"A heron standing in a pond at dawn.","edit":"Make the sky pink."}' --text 'Here are the heron and its pink-sky edit.'
   ```

   Expect: `data.replies` is 4: the draw, the edit and the list are 3 scripted steps, and the text
   reply is the fourth.

2. Send the message. `conversation turn` waits up to 10 s for the message and the reply in the event
   log.

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Draw me a heron, then make the sky pink.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Draw me a heron, then make the sky pink.' --reply 'Here are the heron and its pink-sky edit.'
   ```

   Expect: `conversation turn` exits 0.

3. Check that nixie stored both pictures, and that the second came from the first:

   ```bash
   bun verify db query "select image_id, parent_id, source from images order by created_at, rowid"
   ```

   Expect: `data.rowCount` is 2. The first row has `parent_id` `null` and `source` `draw`. The
   second row has `source` `draw`, and its `parent_id` is the first row's `image_id`.

4. Open the turn's tool calls on the page. Each snapshot gives every element a new `ref`, so take
   each `ref` from the snapshot just before the click. In the first snapshot, find the line that
   holds "image draw:" and `[cursor=pointer]`, and pass its `ref` as `<turn_ref>`. In the second,
   find the line that starts with `group "Tools 3"`, and pass its `ref` as `<tools_ref>`.

   ```bash
   bun verify browser snapshot
   bun verify browser click --ref '<turn_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<tools_ref>'
   bun verify browser snapshot
   ```

   Expect: all commands exit 0.

## End state

- Step 3: the `images` table holds 2 pictures. The second one's `parent_id` is the first one's
  `image_id`.
- The last snapshot of step 4 lists 3 tool calls under "Tools 3", in this order:
  - `image.draw` with the input `{ "prompt": "A heron standing in a pond at dawn." }`. Its result
    names an `image` and has `"from": null`.
  - `image.draw` with the input prompt "Make the sky pink." and `from` set to the first call's
    `image`. Its result names a second `image`, and its `from` is the first call's `image`.
  - `image.list`, whose result lists both `image` IDs, the edit first. The edit's `from` is the
    first picture.
- The conversation ends with the reply "Here are the heron and its pink-sky edit." after "nixie".
