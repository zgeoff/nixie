# calls-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `voice` section has no calls. It offers the model no call tool, starts
no call part, and leaves `voice` out of the features that `nixie.read` reports. The web client hides
the Call entry of its menu, and a direct visit to `/call` shows the page that says the feature is
off in this nixie.

Run this journey on a plain `up`: a test build turns calls on only when `NIXIE_VERIFY_CALLS=1`, so
leave that variable unset in the shell. On `preview`, skip this journey and list the feature as not
verified there in your reply, because the preview's config holds a `voice` section only when its
deployment sets one.

Before you start, run `env -u NIXIE_VERIFY_CALLS bun verify up --restart` and `bun verify doctor`,
then [sign-in-enrol](feature-sign-in-enrol.md).

## Journey

1. Start recording under this feature, because `done` records its verdict for the feature that
   `use --feature` set. Then open the conversation page:

   ```bash
   bun verify use --feature calls-off
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   ```

   Expect: all three commands exit 0. The snapshot shows the Send button and, in the menu, no link
   named "Call".

2. Visit the call page by its address:

   ```bash
   bun verify browser goto /call
   bun verify browser snapshot --until-text 'This feature is off in this nixie'
   ```

   Expect: both commands exit 0. The snapshot shows the text that the feature is off, and no button
   to start a call.

3. Check that nixie gave the model no call tool:

   ```bash
   bun verify db query "with last as (select payload from records where kind = 'server.started' order by sequence desc limit 1) select (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value like 'call.%') as call_tools, (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value = 'task.start') as task_start_tools"
   ```

   Expect: one row, with `call_tools` 0 and `task_start_tools` 1. When `task_start_tools` is 1, the
   list holds other tools, so a `call_tools` of 0 does not come from an empty list.

## End state

- In step 1, the menu held no Call entry.
- In step 2, the call page said that the feature is off in this nixie.
- In step 3, the model's tool list held no `call.` tool.

Once the end state matches, run `bun verify done`. When a command fails, follow its row in
[Exit codes](exit-codes.md). When a command exits 0 but the app differs from the end state, such as
a Call entry in the menu, a `/call` page that offers to start a call, or a `call_tools` above 0,
skip `done` and follow step 5 of "Check a change" in the [verify skill](../SKILL.md).
