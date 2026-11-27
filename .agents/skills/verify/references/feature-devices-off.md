# devices-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `devices` section has no devices. It offers the model no device tool,
issues no code for a device session, and leaves `devices` out of the features that `nixie.read`
reports. The web client hides the Device view and Add a device entries of its menu, and a direct
visit to `/device-view` shows the page that says the feature is off in this nixie.

Run this journey on `local` only, on an `up` of its own, because every device journey needs devices
on:

- On `local`, `NIXIE_VERIFY_NO_DEVICES=1 bun verify up --restart` runs a test build of nixie with
  the `devices` section taken out of the config.
- On `preview`, skip this journey, and list the feature as not verified there in your reply. The
  preview's config holds a `devices` section, so its devices are on.

Before you start, run that `up` and `bun verify doctor`, then
[sign-in-enrol](feature-sign-in-enrol.md).

## Journey

1. Record every later command of this journey under this feature, and open the conversation page:

   ```bash
   bun verify use --feature devices-off
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   ```

   Expect: all three commands exit 0. The snapshot shows the Send button and, in the menu, no link
   named "Device view" or "Add a device".

2. Visit the device view by its address:

   ```bash
   bun verify browser goto /device-view
   bun verify browser snapshot --until-text 'This feature is off in this nixie'
   ```

   Expect: both commands exit 0. The snapshot shows the text that the feature is off.

3. Check that nixie gave the model no device tool:

   ```bash
   bun verify db query "with last as (select payload from records where kind = 'server.started' order by sequence desc limit 1) select (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value like 'device.%') as device_tools, (select count(*) from last, json_each(last.payload, '$.given.tools') t where t.value = 'task.start') as task_start_tools"
   ```

   Expect: one row, with `device_tools` 0 and `task_start_tools` 1.

## End state

- In step 1, the menu held no device entry.
- In step 2, the device view said that the feature is off in this nixie.
- In step 3, the model's tool list held no `device.` tool.

Once the end state matches, run `bun verify done`. When a command fails, follow its row in
[Exit codes](exit-codes.md), and skip `done` as step 5 of Check a change in [SKILL.md](../SKILL.md)
says. Whether the journey passed or failed, run `bun verify up --restart` and `bun verify doctor`
last, so the next journey has devices on.
