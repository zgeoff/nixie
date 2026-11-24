# live-updates

- [Journey](#journey): open a second tab, pause nixie in it, and see the pause in the first tab.
- [End state](#end-state): what the first tab shows without a reload, and what the database holds.

Each tab of the web client holds one live stream. When nixie pauses, the stream tells the first tab,
which reads the pause again and shows the banner "nixie is paused" with no reload. Run this journey
on `local` and on `preview`.

Before you start:

- Run [sign-in-enrol](feature-sign-in-enrol.md) first when the browser holds no session since `up`.
- Start with nixie running. When an earlier journey left it paused, press "Resume nixie" on the
  conversation page first.

## Journey

1. Record the next commands under this feature, and script a reply with a link that opens in a new
   tab:

   ```bash
   bun verify use --feature live-updates
   bun verify action script-reply --text 'Open [the task list](/tasks) in a new tab.'
   ```

   Expect: `data.replies` above 0.

2. Send a message, and open the link in the reply:

   ```bash
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Where is the task list?'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Where is the task list?' --reply 'Open [the task list](/tasks) in a new tab.'
   bun verify browser click --text 'the task list'
   bun verify browser tabs
   ```

   Expect: `browser tabs` lists the conversation as tab 0 and the task list as tab 1.

3. Pause nixie in the second tab:

   ```bash
   bun verify browser tab 1
   bun verify browser snapshot --until-text 'Pause nixie'
   bun verify browser click --role button --name 'Pause nixie'
   bun verify browser snapshot --until-text 'nixie is paused'
   ```

   Expect: the second tab shows "nixie is paused".

4. Go back to the first tab, and read it with no reload:

   ```bash
   bun verify browser tab 0
   bun verify browser snapshot --until-text 'nixie is paused'
   bun verify db query "select cause from nixie_pause"
   ```

   Expect: the first tab shows the region "nixie is paused" within a few seconds, and the one row in
   `data.rows` has `cause` `owner`. When the snapshot fails to show it, the tab did not hear of the
   pause: skip `done`, and report the snapshot.

5. Resume nixie from the first tab, and see the banner go from the second tab:

   ```bash
   bun verify browser click --role button --name 'Resume nixie'
   bun verify browser tab 1
   bun verify browser snapshot --until-no-text 'nixie is paused'
   bun verify db query "select count(*) as paused from nixie_pause"
   ```

   Expect: the second tab no longer shows "nixie is paused", and `paused` is 0 in `data.rows`.

## End state

- After the pause in the second tab, the first tab shows the banner "nixie is paused" with no
  reload, and `nixie_pause` holds one row with `cause` `owner`.
- After the resume in the first tab, the second tab shows no banner, and `nixie_pause` holds no row.
