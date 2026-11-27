# calls-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `voice` section has no calls. It offers the model no call tool, starts
no call part, and leaves `voice` out of the features that `nixie.read` reports. The web client hides
the Call entry of its menu, and a direct visit to `/call` shows the page that says the feature is
off in this nixie.

A test build turns calls on only when `NIXIE_VERIFY_CALLS=1`, so this journey runs on a plain `up`.
On `preview`, skip this journey and list the feature as not verified there in your reply, because
the preview's config holds a `voice` section only when its deployment sets one.

Before you start, run `bun verify up --restart` and `bun verify doctor`, then
[sign-in-enrol](feature-sign-in-enrol.md).

## Journey

1. Record every later command of this journey under this feature, and open the conversation page:

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

   Expect: one row, with `call_tools` 0 and `task_start_tools` 1. The second count shows that the
   list holds other tools, so a `call_tools` of 0 does not mean an empty list.

## End state

- In step 1, the menu held no Call entry.
- In step 2, the call page said that the feature is off in this nixie.
- In step 3, the model's tool list held no `call.` tool.

Once the end state matches, run `bun verify done`.
