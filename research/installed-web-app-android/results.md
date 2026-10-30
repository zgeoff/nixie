# Results: what the installed web app can do on Android

This report reads current browser and platform docs and nixie's code for each question in the
[README](README.md), then drafts which pieces of the Android app move earlier as web work. Every
finding waits on the [device checklist](device-checklist.md), and a claim that no current doc states
is marked unconfirmed.

## Setup

The docs were read in the last week of October 2026, against nixie's `main` at release 0.55.0. The
[source dates](#source-dates) table gives each page's own date, because several Chrome pages that
describe behaviour on Android carry an old date. MDN's compatibility tables come from
browser-compat-data 8.1.7.

The web client is installable from Chrome's menu. Its
[manifest](../../apps/web/public/manifest.webmanifest) holds the ID, the name, `start_url`, a scope
of `/`, a standalone display, the colours and the icons, and holds no `share_target`,
`launch_handler` or `shortcuts`. The client registers no service worker, as the
[session forwarding](../../docs/architecture/channels/client.md#session-forwarding) section of the
client doc gives, so the client has no push, no share target that takes files and no background
sync.

## Push

### What the docs say

- Chrome receives web push through FCM, and the service worker runs with the app and the browser
  closed ([push overview](https://web.dev/articles/push-notifications-overview)).
- FCM delays a normal-priority message in Doze and delivers a high-priority one at once. FCM lowers
  the priority of an app whose high-priority messages lead to no visible notification
  ([FCM message priority](https://firebase.google.com/docs/cloud-messaging/android/message-priority)).
  The web push protocol sets priority with the `Urgency` header, whose `high` value means a
  time-sensitive alert ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html)). Unconfirmed: no
  Google doc states that `Urgency: high` maps to FCM's high priority.
- Chrome requires `userVisibleOnly: true`, so every push shows a notification
  ([subscribing a user](https://web.dev/articles/push-notifications-subscribing-a-user)).
- A WebAPK gets no notification permission at install and asks at runtime
  ([WebAPKs](https://web.dev/articles/webapks)). From Chrome 155 the Android prompt is a small
  non-blocking one, and `requestPermission()` resolves to `default` when it expires unanswered
  ([notification prompts on Android](https://developer.chrome.com/blog/notification-prompts-android)).
- A notification takes action buttons, and the `notificationclick` event holds the tapped button in
  `event.action`; `Notification.maxActions` gives the browser's limit
  ([Notifications standard](https://notifications.spec.whatwg.org/),
  [notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event)).
  MDN lists `actions` on Chrome for Android from 53. Unconfirmed: Chrome's value of `maxActions` on
  Android, and an inline text reply, which the standard does not define.
- A `fetch()` from the service worker sends same-origin cookies by default
  ([RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)). Unconfirmed: no doc
  states that a `SameSite=Lax` cookie rides a fetch that the worker starts from `notificationclick`,
  and the device run checks it.
- The Badging API is unsupported on Android. Android shows a dot on the icon of an installed web app
  while a notification is unread, never a count
  ([Badging API](https://developer.chrome.com/docs/capabilities/web-apis/badging-api)).
- Chrome gives each site its own Android notification channel, so Do Not Disturb and its per-channel
  override apply to it
  ([site channels](https://www.androidpolice.com/2017/07/28/chrome-android-o-will-give-website-notification-channel/),
  a secondary source). A notification with the same `tag` replaces the earlier one, `renotify`
  alerts again, and `silent` alerts never
  ([notification behaviour](https://web.dev/articles/push-notifications-notification-behaviour)).
- Chrome removes notification permission from sites with very low engagement and a high volume, on
  Android and desktop, and never from an installed web app
  ([automatic permission removal](https://blog.google/chromium/automatic-notification-permission/)).
  An on-device model on Android flags spam notifications from their title, body and button text
  ([unwanted notifications](https://blog.chromium.org/2025/05/fighting-unwanted-notifications-with.html)).
- On iOS and iPadOS, web push reaches Home Screen web apps only, and badging works there
  ([web push on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  Safari supports no notification action buttons, and Declarative Web Push, from iOS 18.4, needs no
  service worker ([Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)).

### What nixie does

nixie sends no push of any kind. The Telegram notifier in
[0009](../../docs/decisions/0009-first-channel.md) is unbuilt, and a push in the
[client design](../../docs/design/platform/channels/client.md#deep-links) carries only a link.

An approval passes the server's check through the session alone. The API refuses any call without
the `x-nixie-client` header ([create-api-app.ts:25](../../modules/api/src/create-api-app.ts#L25)),
then `memory.approveProposals` resolves the caller from the session and checks the proposal ID and
action hash of each answer
([create-memory-proposal-procedures.ts:28](../../modules/api/src/create-memory-proposal-procedures.ts#L28),
[line 141](../../modules/api/src/create-memory-proposal-procedures.ts#L141)). A service worker can
send that header and the cookie, so a notification's Approve button passes the same check as the
card, if the push carries the proposal ID and the action hash.

[0012](../../docs/decisions/0012-high-risk-approvals.md) gives an always-ask approval a passkey
check. WebAuthn runs in a page, so the button for an always-ask item opens its card instead of
approving.

### Reading

Web push covers what native push is for on Android: delivery while closed, buttons, a dot on the
icon, a replaceable notice through `tag`, and loud or quiet notices through `silent` and `renotify`,
which match the two push levels of [0029](../../docs/decisions/0029-channels-and-clients.md). Web
push encrypts each payload end to end ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html)), and
FCM keeps no chat history, so it stores less outside the home than the Telegram notice that 0009
plans. iOS takes no buttons, so an iOS notice opens the card.

## Links

### What the docs say

- A WebAPK registers Android intent filters for every URL inside its scope, so a link tapped in
  another app opens the app. A URL typed into Chrome's address bar opens in Chrome
  ([WebAPKs](https://web.dev/articles/webapks)). Unconfirmed: which app a link tapped inside a
  Chrome tab opens.
- A WebAPK exists only after Google's server mints it through Play Services. Without a minted
  WebAPK, Chrome adds a home screen shortcut, which captures no links
  ([installation](https://web.dev/learn/pwa/installation)). Unconfirmed: whether a deployment that
  only a private network reaches gets a WebAPK, because no current doc states what the minting
  server fetches.
- `launch_handler` ships on desktop only, with no Android milestone
  ([launch handler status](https://chromestatus.com/feature/5722383233056768)), and MDN lists
  `window.launchQueue` as unsupported on Chrome for Android
  ([launch_handler](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler)).
  Chrome's link capturing page covers desktop, and states that mobile opens the installed app first
  ([navigation management](https://developer.chrome.com/docs/capabilities/pwa-navigation-management)).

### What nixie does

The manifest's scope is `/`
([manifest.webmanifest:6](../../apps/web/public/manifest.webmanifest#L6)), so every link to the host
is in scope. The client has no `/i/<item_id>` or `/digest` route yet; the
[routes folder](../../apps/web/src/routes/) holds the conversation, memory, proposals, moments and
tasks.

### Reading

A minted WebAPK gives nixie's links what verified App Links give the Expo app. The device run
settles the minting of a deployment's host and what a second tapped link does to an open app.

## Sessions

### What the docs say

- A WebAPK shares Chrome's profile: cookies, storage and the service worker. Clearing Chrome's data
  or the site's data signs the app out ([WebAPKs](https://web.dev/articles/webapks)).
- Chrome grants persistent storage without a prompt to an installed or engaged site, and then never
  evicts its cookies or storage under storage pressure
  ([persistent storage](https://web.dev/articles/persistent-storage)).
- Device Bound Session Credentials bind a session to a key in the device's hardware. Chrome ships
  them on Windows and macOS, with no Android milestone
  ([DBSC](https://developer.chrome.com/docs/web-platform/device-bound-session-credentials),
  [DBSC status](https://chromestatus.com/feature/5140168270413824)).
- Passkeys work in Chrome for Android, so a passkey check needs no native app
  ([PublicKeyCredential](https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential)).
- `expo-secure-store` encrypts each value with an Android Keystore key and keeps it in
  SharedPreferences. Uninstalling the app deletes the key, and `requireAuthentication` asks for the
  user's biometric or PIN on each read
  ([SecureStore, SDK 58](https://docs.expo.dev/versions/latest/sdk/securestore/)).

### What nixie does

The API sets the session as a host-only `HttpOnly; Secure; SameSite=Lax` cookie with the longest
lifetime a browser keeps
([render-session-cookie.ts:4](../../libs/contract/src/render-session-cookie.ts#L4),
[line 11](../../libs/contract/src/render-session-cookie.ts#L11)). The cookie is Lax so that a launch
from the app's icon sends it. The server keeps only a hash of each token, and a session lapses after
30 days without use by default, as the
[device sessions](../../docs/design/platform/channels/client.md#device-sessions) design gives.

### Reading

Neither store binds the session to the phone's hardware. A script in the page cannot read the
`HttpOnly` cookie, while the Expo app's own code reads its token; a script injected into either app
can call the API with the session. `requireAuthentication` adds a biometric check that the cookie
lacks, and the passkey check of 0012 covers that need for always-ask items. The session design needs
no change for the installed app.

## Paste spans

### What the docs say

Gboard sends a clipboard chip as `insertText`, with no paste event, and other projects report the
same ([Tiptap issue 5911](https://github.com/ueberdosis/tiptap/issues/5911)). Android's input method
interface carries no edit semantics, so a page cannot tell a keyboard's paste from typing
([editing task force](https://lists.w3.org/Archives/Public/public-editing-tf/2017Jun/0005.html)).
EditContext ships on Chrome for Android from 121
([EditContext status](https://chromestatus.com/feature/5041440373604352)).

### What nixie does

The composer records `inputType`, `data` and the selection on each `beforeinput`
([use-pending-input.ts:18](../../apps/web/src/use-pending-input.ts#L18)). The span logic labels a
single `insertText` or `insertCompositionText` of several words as unknown
([pick-span-source.ts:27](../../libs/contract/src/pick-span-source.ts#L27)), so a clipboard chip, a
keyboard's own undo and a dictated phrase fail closed. The
[paste spans spike](../paste-spans/results.md#android-gboard-in-chrome) ran Gboard in Chrome on a
phone and showed typing, predictions, autocorrect and swipes land typed.

### Reading

The installed app runs Chrome's renderer, so the paste spans spike's Chrome results carry over. A
native hook misses the clipboard chip too, and a React Native text box reports no input type, so the
[React Native](../paste-spans/results.md#react-native) route labels every swiped or suggested word
unknown. The web client keeps more of the user's typing as evidence than the native module would. A
clipboard chip of one word lands typed on either route. The device run covers the keyboards the
paste spans spike left out.

## Probe app

The [probe app](probe-app/README.md) runs blocks 1, 2, 6 and 7 of the device checklist. Its build
rests on these facts, read on 2026-10-30, and the device run checks each one:

- Chrome's install criteria ask for a manifest with a name, a 192 px and a 512 px icon, a
  `start_url` and a standalone display, served over HTTPS, and list no service worker
  ([install criteria](https://web.dev/articles/install-criteria)). The probe app registers one for
  push, Approve and sync.
- `pushManager.subscribe()` needs `userVisibleOnly: true` and takes the server's P-256 key as a
  base64 string
  ([PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)).
  The probe server encrypts each payload as RFC 8291 gives and signs each send with a VAPID token
  whose expiry lies within 24 hours ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)).
- `showNotification()` takes `actions` on Chrome for Android from 48, and `renotify` only with a
  `tag`; MDN still marks `renotify`, `data` and `requireInteraction` experimental
  ([showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)).
  `Notification.maxActions` exists on Chrome for Android from 48
  ([maxActions](https://developer.mozilla.org/en-US/docs/Web/API/Notification/maxActions_static)).
- A notification tap opens no window by itself: the service worker calls `clients.openWindow()` or
  `focus()`, which a notification click allows
  ([openWindow](https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow),
  [focus](https://developer.mozilla.org/en-US/docs/Web/API/WindowClient/focus)). The probe's Approve
  tap calls neither, so block 2 can record that no window opens.
- MDN states that the server may take a share target's POST itself, with a 303 answer against a
  resubmit, while Chrome's 2019 page shows only the service worker route
  ([share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)).
  The spec drops a share target whose action lies outside the manifest's scope
  ([Web Share Target](https://w3c.github.io/web-share-target/)). The probe's server takes the POST,
  and block 6 records whether it carries the `SameSite=Lax` cookie.
- The `sync` event and its `lastChance` flag run on Chrome for Android from 49, and a rejected sync
  makes Chrome schedule a retry with back-off; no page gives the number of tries
  ([Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API),
  [background sync](https://developer.chrome.com/blog/background-sync)).

## Other capabilities

- **Share target.** An installed app can take shared text, links and files from Android's share
  sheet through `share_target`; a POST share with files reaches the service worker
  ([Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)).
  Android often puts a shared link in `text`, not `url`. A changed `share_target` updates the WebAPK
  ([manifest updates](https://web.dev/articles/manifest-updates)).
- **Background sync.** The `sync` event fires once the network returns, with the app closed. The
  outbox keeps unsent messages in `localStorage`
  ([use-stored-outbox.ts:83](../../apps/web/src/use-stored-outbox.ts#L83)), which a service worker
  cannot read, so background sending needs the outbox in IndexedDB. Periodic sync needs an installed
  app and lets Chrome pick the interval
  ([periodic background sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync)).
- **Manifest shortcuts.** A long press on the icon offers the manifest's shortcuts, such as the
  approval digest and a new message; MDN lists `shortcuts` on Chrome for Android from 84
  ([shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)).
- **Voice.** The installed app shares the site's microphone permission, as the
  [client doc](../../docs/architecture/channels/client.md) gives, and `SpeechRecognition` is
  unprefixed from Chrome 139 on Android. [0009](../../docs/decisions/0009-first-channel.md) gives
  iOS's limits on audio in the background.
- **WebAPK updates.** Chrome checks the manifest at most once a day and installs a changed WebAPK
  once the app is closed and the phone charges on Wi-Fi
  ([manifest updates](https://web.dev/articles/manifest-updates)).

## Draft recommendation

The recommendation waits on the device run. Each row names the device block that confirms it.

| Piece                     | Draft                                                                  | Confirms    |
| ------------------------- | ---------------------------------------------------------------------- | ----------- |
| Push                      | Web work, ahead of native push and ahead of the Telegram notice        | Blocks 1, 2 |
| Approve from notification | Web work for routine items; an always-ask item's button opens its card | Block 2     |
| App Links                 | Covered by the minted WebAPK; drop from the Android app                | Block 3     |
| Secure-store session      | Covered by the cookie; no change to the session design                 | Block 4     |
| Native paste module       | Not needed while the Android client is the web app                     | Block 5     |
| Share target              | Web work, new                                                          | Block 6     |
| Background outbox sending | Web work, with the outbox in IndexedDB                                 | Block 7     |
| Android app               | Hold until a device run shows a need the web app cannot meet           | All blocks  |

The Android app would remain for a need outside this spike's questions, such as a home screen
widget, a quick settings tile or voice with the screen locked.

## Untested

- Every finding above; no step has run on a phone.
- Whether Google's server mints a WebAPK for a deployment's host, and for one only a private network
  reaches.
- Delivery while the phone sits in Doze, and the effect of `Urgency: high`.
- Whether the session cookie rides a fetch from `notificationclick`, and whether Android asks for an
  unlock before a button acts from the lock screen.
- Chrome's `maxActions` on Android.
- Keyboards other than Gboard, such as Samsung Keyboard and SwiftKey.
- iOS, which this spike reads but does not plan a run for.

## Source dates

Each page's own date, as the page shows it; "none" marks a page with no date.

| Source                                                  | Page date  |
| ------------------------------------------------------- | ---------- |
| FCM message priority (firebase.google.com)              | 2026-10-28 |
| notificationclick (MDN)                                 | 2026-10-26 |
| Notifications standard (WHATWG)                         | 2026-10-19 |
| showNotification (MDN)                                  | 2026-10-11 |
| Clients.openWindow (MDN)                                | 2026-09-12 |
| share_target (MDN)                                      | 2026-08-27 |
| Notification prompts on Android (developer.chrome.com)  | 2026-07-22 |
| RequestInit (MDN)                                       | 2026-06-26 |
| Notification.maxActions (MDN)                           | 2026-05-31 |
| WindowClient.focus (MDN)                                | 2025-11-30 |
| launch_handler (MDN)                                    | 2025-11-13 |
| Automatic notification permission removal (blog.google) | 2025-10-10 |
| Navigation management (developer.chrome.com)            | 2025-08-19 |
| Periodic background sync (developer.chrome.com)         | 2025-08-19 |
| PushManager.subscribe (MDN)                             | 2025-06-23 |
| Unwanted notifications (blog.chromium.org)              | 2025-05    |
| DBSC (developer.chrome.com)                             | 2025-04-15 |
| Declarative Web Push (webkit.org)                       | 2025-03-27 |
| Tiptap issue 5911 (github.com)                          | 2024-12-04 |
| Installation (web.dev)                                  | 2024-09-20 |
| Manifest updates (web.dev)                              | 2024-09-19 |
| Install criteria (web.dev)                              | 2024-09-19 |
| Background Synchronization API, lastChance (MDN)        | 2024-04-22 |
| Web push on iOS (webkit.org)                            | 2023-02-16 |
| Push overview (web.dev)                                 | 2020-11-10 |
| Persistent storage (web.dev)                            | 2020-05-12 |
| Web Share Target (developer.chrome.com)                 | 2019-11-08 |
| Badging API (developer.chrome.com)                      | 2018-12-11 |
| RFC 8291                                                | 2017-11    |
| RFC 8292                                                | 2017-11    |
| Site notification channels (androidpolice.com)          | 2017-07-28 |
| Editing task force (lists.w3.org)                       | 2017-06    |
| WebAPKs (web.dev)                                       | 2017-05-21 |
| RFC 8030                                                | 2016-12    |
| Subscribing a user, notification behaviour (web.dev)    | 2016-06-30 |
| Background sync (developer.chrome.com)                  | 2015-12-08 |
| Shortcuts, PublicKeyCredential (MDN)                    | none       |
| SecureStore, SDK 58 (docs.expo.dev)                     | none       |
| chromestatus entries                                    | none       |
| Web Share Target spec (w3c.github.io)                   | none       |
