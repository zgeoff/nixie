# The web client

The web client in `apps/web` is a TanStack Start server with its own process and image, beside
nixie's API. It renders the conversation, and the browser then talks to the API on its own origin.
Start holds no session: on every call it makes while it renders, it forwards the browser's device
session to the API as a bearer token. The [client design](../design/platform/channels/client.md) and
[0029](../decisions/0029-channels-and-clients.md) set this shape, and the
[client contract](contract.md) covers the procedures it calls.

## One host name

A reverse proxy serves the web client and the API on one host name: `/rpc` goes to the API and every
other path to the web server. The browser's client calls `/rpc` on the page's own origin, and the
browser attaches the session cookie itself. **Why:** one host-only cookie then reaches both servers,
and no call crosses origins, so the API needs no CORS.

The web server never serves `/rpc`. It reaches the API at the private URL in `NIXIE_API_URL`, which
only the server bundle reads.

## Session forwarding

`getClient` picks one oRPC client per side with Start's `createIsomorphicFn`, and the Start compiler
keeps only the matching branch in each bundle.

- **In the browser,** the client sends the custom client header and lets the browser add the cookie.
  No client script reads or sets the session cookie: the API sets it from the enrolment response
  with `Path=/`.
- **On the server,** the client reads the session cookie of the request it renders through Start's
  `getCookie`, and sends it as `Authorization: Bearer`. It sends no cookie and no credential of its
  own.

Start scopes `getCookie` to the current request, so one server client serves every request without
crossing sessions. Start sets no cookie and keeps nothing between requests. **Why:** server
rendering then grants exactly the authority of the browser that asked, and the API checks every call
the same way, whichever side it comes from.

The index route's loader reads the conversation. When the API refuses the session with
`UNAUTHORIZED`, the page renders the enrolment form instead of an error. A successful enrolment
invalidates the router, and the loader runs again with the new cookie.

## The conversation

The conversation view shows 3 sources in one list:

- the page that `conversation.read` returned
- the records that `log.follow` streams after the page's `readAtSequence`, each sequence shown once
- the messages this device sent that the list does not show yet, from the outbox

A dropped live stream reconnects after 2 s, from the last sequence it delivered.

The message box labels every span of its text with the contract's paste-span logic. It listens for
the native `beforeinput` event, because React's `onBeforeInput` carries no `inputType`.

## The outbox

Every message gets its client message ID when you send it, and the outbox keeps it until the server
confirms it. An unconfirmed message stays in `localStorage` under `nixie.outbox`, shows as "Not
sent" with a Retry control after a failed send, and goes again with the same ID. A page load sends
every stored message again. **Why:** the server writes a message once per client message ID, so a
retry can never write it twice.

The outbox drops a stored message that no longer fits the contract's `conversation.send` input.

## Health and the image

The web server serves 2 health endpoints before Start sees the request:

| Path            | Returns 200 when                       |
| --------------- | -------------------------------------- |
| `/health/live`  | the process answers                    |
| `/health/ready` | the API answers a call with no session |

The readiness probe calls `sessions.list` with no credential and takes the API's typed
`UNAUTHORIZED` as proof that the API is up. On any other outcome the endpoint returns 503.

The Vite build bundles every dependency into `dist/server/server.js`, Start's server entry. Bun
serves the entry's default export on `PORT`, so the [web image](../../apps/web/Dockerfile) holds Bun
and `dist/` only: no `node_modules`, secrets, database or credentials. It runs as the `bun` user,
and the deployment supplies `NIXIE_API_URL`.

## Tests

The view tests run on happy-dom against a mock of the contract. MSW intercepts each call to `/rpc`
on the page's origin and passes it to an oRPC handler that implements the contract over an in-memory
store. The MSW handler keeps a cookie jar in place of the browser's. The server tests build the app
once per test process and run the built server against the same mock API on a loopback port.
