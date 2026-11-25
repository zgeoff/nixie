# live-updates

- [Journey](#journey): open the conversation page, pause and resume nixie from the host, and see
  each change arrive over the stream that is already open.
- [End state](#end-state): what the page shows without a reload, what the database holds, and how
  many live streams the browser opened.

Each tab of the web client holds one live stream. When nixie pauses, the stream tells the tab, which
reads the pause again and shows the banner "nixie is paused" with no reload. Run this journey on
`local` and on `preview`.

A tab that opens its stream reads every topic again, on its first open and on each reconnect. So a
banner that changes proves a live event only while the stream stays open. On `local`, run
`bun verify live opens` to count the live streams the browser opened. When the count stays the same
from step 2 to step 4, the resume and the second pause reached the tab over its open stream. The
first pause can land while the stream is still opening, so step 2 only waits until the stream is
open.

`live opens` reads the `local` harness. On `preview`, skip each `live opens` line: there the banner
shows only that the tab heard of each change. Record `done` as usual, and add a line to your reply
that the count went unchecked on `preview`.

Keep one tab in front for the whole journey, and never switch tabs. A tab that comes to the front
opens its stream again, which moves the count. `bun verify action pause-from-host` runs
`nixie pause` on the host, a second client of the same nixie, so the one tab waits in front.

Before you start:

- Run [sign-in-enrol](feature-sign-in-enrol.md) first when the browser holds no session since `up`.
- Start with nixie running. When an earlier journey left it paused, press "Resume nixie" on the
  conversation page first.

## Journey

1. Record the next commands under this feature, and open the conversation page:

   ```bash
   bun verify use --feature live-updates
   bun verify browser goto /
   bun verify browser snapshot --until-text 'Send'
   bun verify db query "select count(*) as paused from nixie_pause"
   ```

   Expect: the page shows the Send button and no banner, and `paused` is 0 in `data.rows`.

2. Pause nixie from the host, wait for the banner, and count the streams the browser opened:

   ```bash
   bun verify action pause-from-host --state paused
   bun verify browser snapshot --until-text 'nixie is paused'
   bun verify live opens
   ```

   Expect: the page shows the region "nixie is paused", and `data.opened` is 1 or more. Keep
   `data.opened` for step 4. When the banner does not show, the tab did not hear of the pause: skip
   `done`, and report the snapshot.

3. Resume nixie from the host, and see the banner go with no reload:

   ```bash
   bun verify action pause-from-host --state running
   bun verify browser snapshot --until-no-text 'nixie is paused'
   bun verify db query "select count(*) as paused from nixie_pause"
   ```

   Expect: the page no longer shows "nixie is paused", and `paused` is 0 in `data.rows`.

4. Pause nixie from the host again, and see the banner with no reload:

   ```bash
   bun verify action pause-from-host --state paused
   bun verify browser snapshot --until-text 'nixie is paused'
   bun verify db query "select cause from nixie_pause"
   ```

   Then check that the browser opened no stream since step 2: run
   `bun verify live opens --opened <opened>`, with the `data.opened` you kept in step 2 in place of
   `<opened>`.

   Expect: the page shows the region "nixie is paused" within a few seconds, the one row in
   `data.rows` has `cause` `owner`, and `live opens` exits 0. When `live opens` fails with
   `check-failed`, the tab opened its stream again, so the banner proves no live event: skip `done`,
   and report both counts.

5. Resume nixie, so the next journey starts running:

   ```bash
   bun verify action pause-from-host --state running
   bun verify browser snapshot --until-no-text 'nixie is paused'
   ```

   Expect: the page no longer shows "nixie is paused".

## End state

- After the second pause from the host, the page shows the banner "nixie is paused" with no reload,
  and `nixie_pause` holds one row with `cause` `owner`.
- After each resume from the host, the page shows no banner, and `nixie_pause` holds no row.
- On `local`, the count of live streams the browser opened is the same after the second pause as
  after the first.
