# Spike: forwarding the device session through a separate Start server

This spike runs the web client on TanStack Start as its own server, in front of a stand-in for
nixie's API, and checks that Start forwards the device session and holds none. It tests the shape in
the [client design](../../docs/design/platform/channels/client.md), and its host-name finding feeds
decision [0029](../../docs/decisions/0029-channels-and-clients.md).

## Question

Can a separate Start server render pages with the caller's device session while it holds no session,
and does the browser bundle stay free of server code and private addresses?

## Answer

- All 6 checks pass: server rendering forwards the cookie to the API as a bearer token, and the
  browser calls the API straight with its cookie.
- 20 concurrent renders for 2 devices never crossed sessions, Start set no cookie, and a restarted
  Start server rendered the same session at once.
- A missing or revoked session renders signed out, and the API refuses it with 401.
- The 382 KiB client bundle holds no private URL, cookie name or server code.
- One host-only cookie reaches both servers only under one host name.

Serve Start and the API under one host name, with a reverse proxy that sends `/rpc` to nixie.

## Run it

```bash
bun install
bunx playwright-core install chromium
bun run.ts
```

The [setup](results.md#setup) gives the versions and what each part of the spike does.

## Results

The [results](results.md) hold the output of each check, the findings and the host-name trade-off.

## Untested

HTTPS through a reverse proxy, enrolment, the Vite dev server and the Expo app. The
[untested list](results.md#untested) gives the rest.
