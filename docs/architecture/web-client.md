# The web client

The web client in `apps/web` is a TanStack Start server with its own process and image, beside
nixie's API. It renders the conversation, and the browser then talks to the API on its own origin.
Start holds no session: on every call it makes while it renders, it forwards the browser's device
session to the API as a bearer token. The [client design](../design/platform/channels/client.md) and
[0029](../decisions/0029-channels-and-clients.md) set this shape, and the
[client contract](contract.md) covers the procedures it calls.

## One host name

A reverse proxy serves the web client and the API on one host name: `/rpc` goes to the API and every
other path to the web server. The browser calls `/rpc` on the page's own origin and attaches the
session cookie itself. **Why:** one host-only cookie then reaches both servers, and no call crosses
origins, so the API needs no CORS.

The web server never serves `/rpc`. It reaches the API at a private URL that only the server bundle
holds.

## Session forwarding

The web client builds one API client per side, and each bundle holds only its own side's client.

- **In the browser,** the client sends the custom client header and lets the browser add the cookie.
  No client script reads or sets the session cookie, because the API sets it on enrolment.
- **On the server,** the client reads the session cookie of the request it renders and sends it as a
  bearer token. It sends no cookie and no credential of its own.

Start scopes the cookie read to the current request, so one server client serves every request
without crossing sessions. Start sets no cookie and keeps nothing between requests. **Why:** server
rendering then grants exactly the authority of the browser that asked, and the API checks every call
the same way, whichever side it comes from.

When the API refuses the session as the page loads, the page renders the enrolment form instead of
an error. A successful enrolment loads the page again with the new cookie.

## The conversation

The conversation view merges 3 sources into one list:

- the page of records that the conversation read returned
- the records that the live stream delivers after that page, each sequence shown once
- the messages this device sent that the list does not show yet, from the outbox

A dropped live stream reconnects from the last sequence it delivered.

The message box labels every span of its text with the contract's paste-span logic. It listens for
the browser's native input event, because React's synthetic event drops the input type.

## The outbox

Every message gets its client message ID when you send it, and the outbox keeps it in local storage
until the server confirms it. A message whose send failed shows as not sent with a retry control,
and goes again with the same ID. A page load sends every stored message again. **Why:** the server
writes a message once per client message ID, so a retry can never write it twice.

The outbox sends one message at a time, in the order you sent them. **Why:** the API writes records
in arrival order, so 2 sends at once could land in the wrong order.

Every tab shares the outbox's storage. A tab's write keeps every stored message that the tab does
not hold and drops only the messages that the tab saw confirmed, so a tab never erases another tab's
unsent message. The outbox drops a stored message that no longer fits the contract's send input.

## Health and the image

The web server answers 2 health endpoints before Start sees the request:

| Path            | Returns 200 when                       |
| --------------- | -------------------------------------- |
| `/health/live`  | the process serves requests            |
| `/health/ready` | the API refuses a call with no session |

The readiness check takes the API's typed refusal as proof that the API is up, and returns 503 on
any other outcome.

Every page that Start renders is private and never stored, and it varies by cookie. **Why:** a page
holds the conversation of the session that asked for it, so no shared cache may serve it to another
browser.

The build bundles every dependency into Start's server entry, so the web image holds Bun and the
build output only: no installed packages, secrets, database or credentials. The image runs as an
unprivileged user, and the deployment supplies the API's private URL.
