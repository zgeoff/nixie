# Spike: forwarding the device session through a separate Start server

This spike runs the web client on TanStack Start as its own server and calls a stand-in for nixie's
API from it. Server rendering forwards the device session from the browser's cookie to the API as a
bearer token, and the browser calls the API straight with its cookie. Start keeps no session of its
own. The [client design](../../docs/design/channels/client.md) describes this shape.

- Bun 1.4.2, TypeScript 7.0.2, Vite 8.3.4, `@vitejs/plugin-react` 6.1.2
- `@tanstack/react-start` 1.168.60, `@tanstack/react-router` 1.170.41, `@tanstack/react-query`
  5.104.1, React 19.3.0
- `@orpc/server`, `@orpc/client`, `@orpc/contract` and `@orpc/tanstack-query` 1.15.5, `elysia`
  1.4.30, `zod` 4.6.5
- `playwright-core` 1.61.0 with the Chromium build it installs

## Question

Can a separate Start server render pages with the caller's device session while it holds no session,
and does the browser bundle stay free of server code and private addresses?

## Run it

Run each command from this directory.

```bash
bun install
bunx playwright-core install chromium
bun run.ts
bun run typecheck
```

`run.ts` builds the Start app, starts the API stand-in and the Start server as 2 processes, drives
them with `fetch` and a headless Chromium, and prints one line per check.

- [contract.ts](./contract.ts) holds the shared contract: `whoami`, which returns the caller's
  session, `tasks.list`, and the `log.follow` live stream.
- [api.ts](./api.ts) is the API stand-in: oRPC in Elysia, a session store that keeps only token
  hashes, a check for the custom client header, CORS for the web origin, and test hooks that record
  calls, revoke a session and append a log record.
- [src/orpc.ts](./src/orpc.ts) holds the isomorphic link. On the server it reads the session cookie
  and sends it as a bearer token to the private API URL. In the browser it calls the public API URL
  with the cookie.
- [start-server.ts](./start-server.ts) serves the Vite build on `Bun.serve`: client assets from
  `dist/client`, and every other request through Start's server entry.

## Results

```text
PASS 1 server render uses the forwarded session: page shows "s-1 laptop bearer", API saw [{"ok":true,"path":"/rpc/whoami","via":"bearer"},{"ok":true,"path":"/rpc/tasks/list","via":"bearer"}]
PASS 2 browser calls reach the API with the same session: browser got {"device":"laptop","sessionId":"s-1","via":"cookie"}, cookie readable from script: false
PASS 4 start keeps no session: 20 concurrent renders, 0 crossed, 0 set a cookie; after a restart the page shows "s-2 phone bearer"
PASS 5 no server code in the bundle: 382 KiB of JS; forbidden strings found: []; public API URL present: true; server build holds the strings: true
PASS 6 the live stream goes from the browser to the API: browser received {"sequence":1,"text":"hello"}; requests went to ["http://127.0.0.1:3200"]
PASS 3 a missing or revoked session is refused: through Start: "signed-out - -" and "signed-out - -"; straight at the API: {"noClientHeader":403,"none":401,"revoked":401,"valid":200}
all checks passed
```

The runner revokes a session last, so check 3 prints last.

## Findings

The design works as written on these versions. The API checks every call, whichever side of Start it
comes from, and server rendering grants no authority beyond the cookie the browser sent.

1. **One module-level link serves every request.** The server link reads the cookie through
   `getCookie` inside its `headers` function, and Start scopes that read to the current request. 20
   concurrent renders for 2 devices never crossed sessions.
2. **Start holds nothing.** Start sent no `Set-Cookie` header, and a restarted Start server rendered
   the same session at once.
3. **A refused session renders signed out.** The route loader catches the API's `UNAUTHORIZED` and
   renders a signed-out page, so Start never answers with an error page for a lapsed session.
4. **The bundle holds only the public side.** The client build holds the public API URL and the
   custom header name. It holds no private URL, cookie name, bearer handling, Elysia or oRPC server
   code. The same search finds the private strings in the server build, so the search works.
5. **The live stream bypasses Start.** The browser follows the log straight from the API with its
   cookie. The [typed API spike](../client-rpc/) covers resume by `Last-Event-ID`.
6. **Start needs no Nitro on Bun.** The Vite build emits `dist/server/server.js` with a `fetch`
   export, and about 25 lines of `Bun.serve` serve it with the client assets.

## A host name constraint the design leaves open

The spike puts both servers on `127.0.0.1` on 2 ports. Browsers ignore the port when they send a
cookie, so one host-only cookie reached both servers. A deployment with 2 host names breaks this: a
host-only cookie set for the API host never reaches Start, and server rendering then sees no
session.

The options:

- **One host name, a path split.** A reverse proxy sends `/rpc` to nixie and everything else to
  Start. The cookie stays host-only, and the browser makes same-origin calls with no CORS. This is
  the recommendation.
- **2 host names under one parent domain.** The cookie takes a `Domain` attribute for the parent, so
  every host under it receives the session, and the API needs CORS with credentials for the web
  origin.

`SameSite=Strict` holds in both options, because the 2 hosts are the same site.

## Not tested

- HTTPS, a real host name, and the cookie path through a reverse proxy
- Enrolment, which sets the cookie; the runner adds the cookie to the browser itself
- The Vite dev server; the runner tests the production build only
- The Expo app, the WebSocket transport, and React Server Components
