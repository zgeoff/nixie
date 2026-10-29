# Device checklist: the installed web app on Android

These steps confirm the [results](results.md) on a real phone with Chrome and the installed nixie
web app. Run the blocks in order, and record each "Record" line in a copy of this file or in the
issue. The [draft recommendation](results.md#draft-recommendation) names the block that confirms
each of its rows.

Blocks 1, 2, 6 and 7 need a service worker and manifest entries that the web client lacks, so they
need the test app, which waits on a decision. The [device run](README.md#device-run) gives the 2
options for it, and `<test_host>` stands for the host it runs on. Blocks 3, 4 and 5 run against your
deployment, `<nixie_host>`, with no new code.

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

Needs the test app, waiting on a decision. The test app at `<test_host>` holds a service worker that
shows each push, a page with a **Subscribe** button, and a command that sends a push with a chosen
`Urgency`, `tag`, `silent` and `renotify`.

1. Install the test app as in "Before you start", open it, and tap **Subscribe**. Expect: Chrome's
   notification prompt. Record: the prompt's form, and the result after you allow.
2. Open **Settings > Apps > (the test app) > Notifications**. Record: whether the app has its own
   notification settings, and the channels listed.
3. Close the app from the recent apps screen, then send a push with `Urgency: normal`. Expect: a
   notification within 10 s. Record: the delay.
4. Turn the screen off, leave the phone still and unplugged for 60 min so it enters Doze, then send
   one push with `Urgency: normal` and one with `Urgency: high`. Record: the delay of each, measured
   from the send to the notification.
5. Send 2 pushes with the same `tag`, the second with `silent: true`. Expect: one notification,
   replaced without sound or vibration. Record: what you heard and saw.
6. Send a push with the same `tag` and `renotify: true`. Expect: the notification replaced, with
   sound. Record: what you heard.
7. Turn on Do Not Disturb, then send a push with `Urgency: high`. Expect: no sound. Record: whether
   the app appears under the exceptions Do Not Disturb offers.
8. Look at the app's icon with a notification unread. Expect: a dot, not a number. Record: dot,
   number or nothing.

## Block 2: Approve from a notification

Needs the test app, waiting on a decision. The test app holds a service worker whose
`notificationclick` calls a test endpoint with the `x-nixie-client` header, and an endpoint that
checks an `HttpOnly; Secure; SameSite=Lax` session cookie and logs each call.

1. Open the test app once so it sets the session cookie, then close it.
2. Send a push with 2 actions, **Approve** and **Open**. Record: the buttons shown, and the value of
   `Notification.maxActions` that the test page prints.
3. Tap **Approve** with the phone unlocked. Expect: the endpoint logs one call with a valid session,
   and no window opens. Record: the log line, and whether a window opened.
4. Lock the phone, send the push again, and tap **Approve** on the lock screen. Record: whether
   Android asks for an unlock before the call, and the endpoint's log line.
5. Clear the site's data in Chrome, then repeat step 3. Expect: the endpoint logs a refused call.
   Record: the log line, and what the notification shows.

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

Needs the test app, waiting on a decision. The test app holds a manifest `share_target` that takes
text, a link and an image by POST, and a page that shows what arrived.

1. Install the test app, wait for its WebAPK to update with the share target, then share a web page
   from Chrome's share sheet. Expect: the test app in the share sheet. Record: present or absent,
   and the fields that arrived, with the link's field.
2. Share a photo from the gallery. Expect: the page shows the image's name, type and size. Record:
   what the page shows.
3. Share selected text from another app. Record: the fields that arrived.

## Block 7: background sync

Needs the test app, waiting on a decision. The test app holds a page that queues a message in
IndexedDB and registers a `sync` event, and a service worker that sends the queue and logs each send
on the server.

1. Turn on aeroplane mode, queue one message, and close the app.
2. Wait 1 min, then turn off aeroplane mode. Expect: the server logs the send within 5 min, with the
   app closed. Record: the delay.
3. Repeat with the phone in battery saver. Record: the delay, or no send within 30 min.
