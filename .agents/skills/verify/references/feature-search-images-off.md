# search-images-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `search` section has no web search, and one with no `images` section has
no image tools. nixie then offers the model no `search` tool and no `image.` tool, answers each
`images` procedure with `FEATURE_OFF`, and leaves both features out of the features that
`nixie.read` reports. Search has no page in the web client. For images, the web client hides the
Images entry of its menu, and a direct visit to `/images` shows the text "This feature is off in
this nixie". The search-off and images-off e2e suites check `nixie.read`. They also check that nixie
refuses to start when its `search` section has no `credential`.

Run this journey on `local` only, on an `up` of its own, because [drawing](feature-drawing.md) and
[images-page](feature-images-page.md) need images on:

- On `local`, run `bun verify use --target local`, then
  `NIXIE_VERIFY_NO_IMAGES=1 bun verify up --restart` to start a test build of nixie with the
  `images` section taken out of the config. The test build never has a `search` section, because no
  journey reaches a search provider. The variable applies to that one `up`, so images stay off until
  the next `up --restart` without it.
- On `preview`, skip this journey and list the feature as not verified there in your reply. The
  preview's config holds an `images` section, so its images are on.

Before you start, run that `up` and `bun verify doctor`, then do
[sign-in-enrol](feature-sign-in-enrol.md), because the journey needs a signed-in user.

## Journey

1. Record every later command of this journey under this feature, and open the conversation page:

   ```bash
   bun verify use --feature search-images-off
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   ```

   Expect: all three commands exit 0. The snapshot shows the Send button and, in the menu, no link
   named "Images".

2. Visit the images page by its address:

   ```bash
   bun verify browser goto /images
   bun verify browser snapshot --until-text 'This feature is off in this nixie'
   ```

   Expect: both commands exit 0. The snapshot shows the text that the feature is off.

3. Check that nixie gave the model no image tool and no search tool:

   ```bash
   bun verify db query "with last as (select payload from records where kind = 'server.started' order by sequence desc limit 1) select (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value like 'image.%') as image_tools, (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value = 'search') as search_tools, (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value = 'task.start') as task_start_tools"
   ```

   Expect: one row, with `image_tools` 0, `search_tools` 0 and `task_start_tools` 1.

## End state

- In step 1, the menu held no Images entry.
- In step 2, the images page said that the feature is off in this nixie.
- In step 3, the model's tool list held no `image.` tool and no `search` tool.

Once the end state matches, run `bun verify done`. When a command fails, follow its row in
[Exit codes](exit-codes.md), and skip `done`. When every command exits 0 but the end state differs,
such as a menu that still shows the Images entry or a tool list that holds an `image.` or a `search`
tool, skip `done` and follow step 5 of "Check a change" in [SKILL.md](../SKILL.md). Fix the app's
code when your change broke the feature. Otherwise list the feature in your reply with the end state
you expected and the `data` you got. When `done` itself fails, follow its row in Exit codes and run
the journey again.

Whether the journey passed or failed, run `bun verify up --restart` without
`NIXIE_VERIFY_NO_IMAGES`, then `bun verify doctor`, so the next journey has images on. When either
fails, follow its row in Exit codes, and run both again before any other journey. To re-run this
journey after a fix, start with `NIXIE_VERIFY_NO_IMAGES=1 bun verify up --restart` again, because a
restart without it turns images on.
