# Spike: what the installed web app can do on Android

This reading spike checks what the nixie web client can do once Chrome on Android installs it as an
app, against the 4 reasons the [client design](../../docs/design/platform/channels/client.md) gives
for the Expo app: push, App Links, a secure-store session and a native paste module. It reads
current browser and platform docs and nixie's code, and writes the device checklist that confirms
each finding on a phone.

## Question

On Chrome for Android, can the installed web app receive push while closed, approve from a
notification, open nixie's links, hold a session as safely as `expo-secure-store`, and keep paste
spans right under Android keyboards? Which pieces of the Android app, and of the later push stage,
move earlier as web work?

## Answer

- Web push reaches an installed app while it is closed, through the same Firebase Cloud Messaging
  (FCM) route as native push. A notification button can approve a routine item from the service
  worker with the session cookie, but an always-ask item needs a page for the passkey check.
- Android shows a dot on the app icon, never a count, and Do Not Disturb applies per site channel.
  Chrome exempts installed apps from its automatic removal of notification permission.
- An installed app opens every link inside its scope from other apps, once Google's server has
  minted it as a WebAPK.
- The session cookie matches `expo-secure-store` for nixie's needs: neither binds the session to the
  phone's hardware, because Chrome ships Device Bound Session Credentials on desktop only.
- The web client labels paste spans better than a native hook can, because the browser reports each
  edit's input type and a React Native text box does not.

Draft, waiting on the device run: build web push, the share target and background sending of the
outbox as web work, ahead of the native app, and keep the native app only for what the device run
shows the web app cannot do.

## Device run

The [device checklist](device-checklist.md) runs on a phone. Blocks 3 to 5 need only a deployment.
Blocks 1, 2, 6 and 7 need a service worker, a push sender, a share target and an endpoint that
checks the session cookie, which nixie lacks, so they run against the
[probe app](probe-app/README.md) in this folder. The probe app leaves product code untouched: it is
a Bun server with its own pages, and it makes the same header and cookie check as nixie's API. Its
[Run it](probe-app/README.md#run-it) steps start it from this folder:

```bash
bun run probe
```

## Results

The [results](results.md) hold the sources with their dates, the findings for each question with
nixie's code, and the draft recommendation. The device checklist holds the steps to run on a phone
and what to record.

## Untested

Every finding comes from documentation and code. No step has run on a device. The
[untested list](results.md#untested) gives the gaps the device run closes.
