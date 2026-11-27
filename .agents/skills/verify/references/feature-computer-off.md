# computer-off

Contents: [Journey](#journey), [End state](#end-state).

A nixie whose config has no `computer` section has no computer. It starts without the computer's
sandbox image, offers the model no `computer.` tool, runs no take-over or handover work, and leaves
`computer` out of the features that `nixie.read` reports. The web client hides the Computer entry of
its menu, and a direct visit to `/computer` shows the page that says the feature is off in this
nixie.

Run this journey on `local` only, on an `up` of its own, because every other computer journey needs
the computer on:

- On `local`, `NIXIE_VERIFY_NO_COMPUTER=1 bun verify up` runs a test build of nixie whose config
  leaves out the `computer` section.
- On `preview`, skip this journey, and list the feature as not verified there in your reply. The
  preview's config holds a `computer` section, so its computer is on.

Before you start, run `NIXIE_VERIFY_NO_COMPUTER=1 bun verify up --restart` and `bun verify doctor`,
then [sign-in-enrol](feature-sign-in-enrol.md).

## Journey

1. Record every later command of this journey under this feature, and open the conversation page:

   ```bash
   bun verify use --feature computer-off
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   ```

   Expect: all three commands exit 0. The snapshot shows the Send button and, in the menu, no link
   named "Computer".

2. Visit the computer page by its address:

   ```bash
   bun verify browser goto /computer
   bun verify browser snapshot --until-text 'This feature is off in this nixie'
   ```

   Expect: both commands exit 0. The snapshot shows the text that the feature is off, and no button
   named "Take over".

3. Check that nixie wrote no record of the computer:

   ```bash
   bun verify db query "select count(*) as computer_records from records where kind like 'computer.%'"
   ```

   Expect: one row, with `computer_records` 0.

## End state

- In step 1, the menu held no Computer entry.
- In step 2, the computer page said that the feature is off in this nixie.
- In step 3, nixie held no `computer.` record.

Once the end state matches, run `bun verify done`. Then run `bun verify up --restart` and
`bun verify doctor`, so the next journey has the computer on.
