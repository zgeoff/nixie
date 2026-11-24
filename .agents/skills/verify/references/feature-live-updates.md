# live-updates

- [Journey](#journey): open the conversation page, pause and resume nixie from the host, and see
  each change with no reload.
- [End state](#end-state): what the page shows without a reload, and what the database holds.

Each tab of the web client holds one live stream. When nixie pauses, the stream tells the tab, which
reads the pause again and shows the banner "nixie is paused" with no reload. Run this journey on
`local` and on `preview`.

A stream that opens reads every topic again, so a pause that lands while the stream is still opening
shows on the page with no live event. The first pause below can show that way, so it proves nothing.
It only waits until the banner shows, which means the stream has opened. The resume and the second
pause land on an open stream, so only a live event can show them.

Keep one tab in front for the whole journey, and never switch tabs. A tab that comes to the front
opens its stream again and reads every topic again. `nixie pause` on the host is a second client of
the same nixie, so the one tab waits in front.

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

2. Pause nixie from the host, and wait for the banner:

   ```bash
   bun verify action pause-from-host --state paused
   bun verify browser snapshot --until-text 'nixie is paused'
   ```

   Expect: the page shows the region "nixie is paused". When it does not, the tab did not hear of
   the pause: skip `done`, and report the snapshot.

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

   Expect: the page shows the region "nixie is paused" within a few seconds, and the one row in
   `data.rows` has `cause` `owner`.

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
