# Probe app

The probe app is a throwaway installable web app for blocks 1, 2, 6 and 7 of the
[device checklist](../device-checklist.md), which need code that the nixie web client lacks. A Bun
server serves one page per block, a service worker and a manifest with a share target. It sends web
push itself, checks each notification's Approve tap with a one-time token, and keeps a results log
in memory that each page reads back. It shares no code with nixie. The pages and the service worker
call the server through one oRPC contract, and the server bundles their scripts when it starts.

## Run it

Run these from a nixie checkout on your PC. The server listens on `http://127.0.0.1:8787/` and
prints the address of the send page, which holds a key made at each start.

```bash
git fetch origin installed-web-app-probe
git switch installed-web-app-probe
bun install
cd research/installed-web-app-android
bun run probe
```

In a second terminal, give the server a temporary public HTTPS URL. The command prints an address
under `trycloudflare.com`, which you open on the phone.

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

The phone needs an HTTPS host, because Chrome installs a web app and runs its service worker only on
HTTPS. A public host also lets block 1 record whether Google's server mints the app. The server
binds to loopback only, so the tunnel is the one way in from outside your PC.

On the first start, the server writes its VAPID key pair to the git-ignored `.vapid/` folder and
reuses it after that, so a phone's push subscription outlives a restart. The results log, the
sessions and the subscriptions live in memory, and a restart clears them: subscribe again on block 1
after a restart.

## Pages

- **Blocks 1, 2, 6 and 7** each list the taps to make and show what the server recorded for this
  phone.
- **Log** shows every entry for this phone's session.
- **Send** opens on the PC, from the address the server prints. It sends a push to every subscribed
  phone with a chosen urgency, tag, sound and buttons, and shows every session's log.

## Checks

```bash
bun test probe-app
```

The tests run in the spike folder. They cover the push encryption against the RFC 8291 test vector,
the VAPID signature, the Approve token check, the share and background sync handlers, and the
service worker's Approve, receipt and outbox code against the real handler.
