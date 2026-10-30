# Device checklist: the installed web app on Android

These steps confirm the [results](results.md) on a real phone with Chrome and the installed nixie
web app. Run the blocks in order, and record each "Record" line in a copy of this file or in the
issue. The [draft recommendation](results.md#draft-recommendation) names the block that confirms
each of its rows.

Blocks 1, 2, 6 and 7 need a service worker and manifest entries that the web client lacks, so they
run against the [probe app](probe-app/README.md), a test app in this folder. `<probe_host>` stands
for the temporary public HTTPS host that the probe app's [Run it](probe-app/README.md#run-it) steps
give, and the send page is the address the probe server prints on your PC. Blocks 3, 4 and 5 run
against your deployment, `<nixie_host>`, with no new code.

## Before you start

1. Record the phone model, the Android version, the Chrome version from `chrome://version`, and the
   keyboard with its version.
2. Open `https://<nixie_host>/` in Chrome, open the menu, and tap **Add to home screen**, then
   **Install**. Expect: the app's icon on the home screen without a Chrome badge, and nixie in
   Android's **Settings > Apps** list.
3. Open `chrome://webapks` in Chrome. Expect: an entry for `https://<nixie_host>/` with a package
   name that starts `org.chromium.webapk`. Record: present or absent. An absent entry means Chrome
   made a shortcut, and block 3 then fails.
4. If your deployment is reachable only on a private network, record that, because it decides
   whether Google's server can mint the app.

## Block 1: push delivery

Runs against the probe app. Its block 1 page subscribes the phone and sends a push to it after a
delay, and the send page on your PC sends a push with a chosen `Urgency`, `tag`, `silent` and
`renotify` at any time. The service worker reports each push it receives, so the log on either page
shows the delay from the send to the receipt.

1. Open `https://<probe_host>/` in Chrome and install it as in "Before you start". Open
   `chrome://webapks` and record whether an entry for `https://<probe_host>/` exists.
2. Open the app from its icon. On the send page, tap **Make a pairing code**, then enter the code on
   the app's home page and tap **Pair**. Expect: `Paired as S-` and a label. Then open **Block 1**
   and tap **Subscribe**. Expect: Chrome's notification prompt, then `Permission: granted` and a
   `Subscribed` line. Record: the prompt's form, and the result after you allow.
3. Open **Settings > Apps > nixie probe > Notifications**. Record: whether the app has its own
   notification settings, and the channels listed.
4. On the block 1 page, keep the delay at 15 s and the urgency at `normal`, tap **Send to this
   phone**, then close the app from the recent apps screen. Expect: a notification within 10 s of
   the send, with the send time in its body. Record: the `push-received` line's `phoneClockDelayMs`.
5. Turn the screen off, leave the phone still and unplugged for 60 min so it enters Doze, then send
   one push with `Urgency: normal` and one with `Urgency: high` from the send page. Record: the
   `phoneClockDelayMs` of each, and the time each notification shows.
6. From the send page, send 2 pushes with the tag `replace`, the second with **silent** ticked.
   Expect: one notification, replaced without sound or vibration. Record: what you heard and saw.
7. Untick **silent**, tick **renotify**, and send a push with the tag `replace`. Expect: the
   notification replaced, with sound. Record: what you heard.
8. Turn on Do Not Disturb, then send a push with `Urgency: high`. Expect: no sound. Record: whether
   the app appears under the exceptions Do Not Disturb offers.
9. Look at the app's icon with a notification unread. Expect: a dot, not a number. Record: dot,
   number or nothing.

## Block 2: Approve from a notification

Runs against the probe app. An approval push carries an **Approve** and an **Open** button and a
one-time token. A tap on **Approve** makes the service worker call the probe server with the
`x-nixie-client` header and the session cookie, as nixie's API expects. The server checks the
header, the `HttpOnly; Secure; SameSite=Lax` session cookie and the token, logs the call, and the
service worker shows the answer as a second notification.

1. Subscribe on block 1, then open **Block 2**. Record: the value of `Notification.maxActions` that
   the page prints.
2. Tap **Send an approval push**, then close the app within the 15 s delay. Expect: a notification
   with **Approve** and **Open**. Record: the buttons shown.
3. Tap **Approve** with the phone unlocked. Expect: a second notification `Approved`, no window
   opens, and the block 2 log shows an `approve` line with `"outcome": "approved"`,
   `"cookieSent": true` and `"sessionKnown": true`. Record: the log line, and whether a window
   opened.
4. Send an approval push from the send page with **Approve and Open buttons** ticked, lock the
   phone, and tap **Approve** on the lock screen. Record: whether Android asks for an unlock before
   the call, and the log line.
5. Send an approval push, then tap **Sign out** on the block 2 page, which makes the server forget
   the session and clear the cookie, and tap **Approve** on the notification. Expect:
   `Refused (401): no session`, and a log line on the send page with `"sessionKnown": false`. Pair
   the phone again, as in block 1 step 2, before the next block. Record: the log line, and what the
   notification shows.

## Block 3: links

Runs against `<nixie_host>` with no new code.

1. Send yourself the link `https://<nixie_host>/memory` in a messaging app, close nixie, and tap the
   link. Expect: the installed app opens on the memory page. Record: app or Chrome tab.
2. Open the app on the conversation, switch to the messaging app, and tap the link again. Record:
   whether the open app navigates to the memory page, a second window opens, or Chrome opens.
3. Tap the same link in an email in Gmail. Record: app or Chrome tab.
4. Open any page in a Chrome tab that links to `https://<nixie_host>/memory`, and tap the link.
   Record: app or Chrome tab.
5. Type `https://<nixie_host>/memory` into Chrome's address bar. Expect: a Chrome tab. Record: app
   or Chrome tab.

## Block 4: session

Runs against `<nixie_host>` with no new code.

1. Sign the installed app in with an enrolment code, then close it from the recent apps screen.
2. Reopen the app from its icon. Expect: the conversation, with no enrolment form. Record: signed in
   or not.
3. Restart the phone and open the app. Expect: signed in. Record: signed in or not.
4. Open `https://<nixie_host>/` in a Chrome tab. Expect: signed in with the same session, because
   the app shares Chrome's cookies. Record: signed in or not, and the session list in the client.
5. Uninstall the app, then open `https://<nixie_host>/` in Chrome. Record: signed in or not.
6. Reinstall the app, open **Settings > Site settings > (nixie host)** in Chrome, tap **Delete
   data**, and open the app. Expect: the enrolment form. Record: what the app shows.

## Block 5: paste spans

Runs the paste spans spike's device page, as its [setup](../paste-spans/results.md#setup) gives. The
installed app runs Chrome's renderer, so a Chrome tab stands in for it. Repeat the block for each
keyboard you can install, such as Gboard, Samsung Keyboard and SwiftKey.

1. Run each case of the [Gboard table](../paste-spans/results.md#android-gboard-in-chrome): typing,
   prediction, autocorrect, swipe, long-press paste, edit inside a paste, undo and clipboard chip.
   Expect: typed text labelled `typed`, a paste labelled `pasted`, and a chip of several words
   labelled `unknown`. Record: the spans the page prints after each case.
2. Tap a phrase suggestion of several words, if the keyboard offers one. Expect: `unknown`. Record:
   the spans.
3. Undo a deleted paste by touch alone, with the keyboard's own undo key. Expect: `unknown`. Record:
   the spans.
4. Dictate a sentence after typed text in the same box. Expect: the typed text `typed` and the
   dictated sentence `unknown`. Record: the spans.

## Block 6: share target

Runs against the probe app. Its manifest holds a `share_target` that takes a title, text, a link and
files by POST, and the probe server records each share and opens the block 6 page on it.

1. Install the probe app, then share a web page from Chrome's share sheet. Expect: **nixie probe**
   in the share sheet, and the block 6 page with the share. Record: present or absent, and the
   fields that arrived, with the field that holds the link.
2. Share a photo from the gallery. Expect: the page shows the image's name, type and size. Record:
   what the page shows.
3. Share selected text from another app. Record: the fields that arrived.
4. On any share, record `cookieSent` and `secFetchSite`, which show whether the share's POST carried
   the `SameSite=Lax` session cookie. A share without the cookie belongs to no session, so it shows
   only in the send page's log.

## Block 7: background sync

Runs against the probe app. Its block 7 page queues a message in IndexedDB and registers a `sync`
event, and the service worker sends the queue to the probe server, which logs each message once with
its delay from the queue time.

1. Open **Block 7**. Expect: `Background sync: supported`. Record: the line.
2. Turn on aeroplane mode, tap **Queue**, and close the app. Expect: the message under **Waiting in
   the outbox** before you close it. A message the server refuses moves to **Refused by the server**
   with the reason, and the messages behind it still send.
3. Wait 1 min, then turn off aeroplane mode. Expect: a `sync` line on the send page within 5 min,
   with the app closed. Record: its `phoneClockDelayMs`, less the minute you waited offline.
4. Repeat with the phone in battery saver. Record: the delay, or no send within 30 min, and
   `lastChance` on the line.
