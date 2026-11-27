# Google connections

A Google connection reaches one Google account through an OAuth client that the user registers. The
connections module owns the client, the consent that makes a connection, and the procedures the web
client calls. [The credential database](credential-database.md) covers where the module keeps each
sealed value, and [the credential store](credentials.md) covers the token exchange and the refresh.

The connections module knows no provider. It owns the
[`Connector`](../../../modules/connections/src/connector/types.ts) interface, which holds a
provider's OAuth endpoints, scopes, setup steps, tools and scope check, and it takes the connector
from the server when it starts. The `google` feature module builds Google's connector, with its
Gmail, Calendar and Drive tools and the Gmail arrival source, and reaches the triggers, policy,
tasks, tools and log modules itself. The `connector-google` adapter gives it Google's hosts, OAuth
consent, setup steps and scope check through the module's
[`GoogleProvider`](../../../modules/google/src/types.ts) interface.

## The switch

Add a `google` section to the config to turn Google on, and write `google: {}` for the defaults.
`google.gmail.poll_interval` sets how often the Gmail arrival source polls, and takes a duration
such as `30s` or `2m`. The section holds the `gmail` section of earlier releases, and a config that
still has `gmail` at the top level fails to load. With no `google` section, nixie has no Google:

- the `google_tools`, `connections` and `gmail_source` server parts never start, so the model is
  offered no Gmail, Calendar or Drive tool, no mailbox is polled and the daily scope check runs
  nowhere;
- the procedures of the `connections` namespace answer `FEATURE_OFF`, and a connection forget that
  was open when nixie stopped stays open until the section returns, because the connection's
  erasable registers with the connections part;
- `nixie.read` leaves `google` out of `features`, the web client hides the Connections menu entry,
  and the connections pages show the page that says the feature is off;
- an action of a Gmail, Calendar or Drive tool that was queued before nixie stopped stays pending
  with no attempt, because the action runner holds each tool name that starts with `gmail.`,
  `calendar.` or `drive.`, and a Gmail match that a wake rule held stays held, because the flush
  reads only the connection mailboxes of the sources that run;
- the web client's `/connections/google/return` route answers the page that says the feature is off,
  and finishes no consent;
- the credential store's database backend still starts, because the MCP proxy keeps its credentials
  in it.

Turning Google off keeps its connections, its mail and its wake rules, and turning it on again finds
them as they were. Google adds one entry to a list that a core module owns: the API module's
body-field readers, which word the card of a Gmail, Calendar or Drive call, filled from the
composition root.

## The OAuth client

The user registers one client per connector with `connections.registerClient`. The call passes the
`Origin` header of the request beside the origin it registers, and the module refuses an origin that
is not https, carries a path, query or user name, or differs from the header. The redirect URI is
that origin plus the connector's return path, and Google checks it against the client exactly. The
client secret is sealed at once and never read back.

`removeClient` refuses while a connection or an unlapsed consent uses the client. The API's checked
actions hash their input, and `registerClient` leaves the secret out of that hash.

A checked action stores a marker before it runs, and stores its outcome under a `result` key, so an
outcome with no data still counts as finished. `registerClient`, `setPicker`, `removeClient` and
`startConsent` commit their outcome in the same transaction as their last write, so a crash never
leaves a change with no stored outcome. nixie writes the log record of a `removeClient` removal
after that transaction. When the removal committed and its log record did not, a retry writes the
log record and answers `ok`.

## The consent

1. `startConsent` makes a consent request bound to the device session that called it, with a random
   `state`, a PKCE verifier sealed under a key of its own, and a short expiry. It answers the
   authorize URL, which always carries a S256 challenge and `prompt=consent`.
2. Google sends the browser to `/connections/google/return`, a web server route. The route calls
   `connections.finishConsent` with the browser's session as a bearer token, and never logs the
   query string. A success answers 303 to the connection's page, and a failure renders a page with
   status 400 that names the error code and Google's own code.
3. `finishConsent` claims the request once, deletes the verifier's key, and exchanges the code into
   a fresh credential of its own. The claim's write repeats the checks of the state, the device
   session and the expiry. The write claims nothing when a retry replaced the state, or the request
   lapsed, between the check and the write. The account comes from the ID token.
4. The module reads each scope once, then decides and writes under one lock. A new account becomes a
   new connection. For an account that a live connection reaches, the module moves the new token
   into that connection. For an account under a Forget, it waits a bounded time for the Forget,
   outside the lock. Two consents for one account at once therefore make one connection. A token
   response with no refresh token keeps nothing.

The request asks for the identity scopes `openid` and `email` beside the 4 tool scopes. Google
grants the identity scopes with no checkbox, so nixie knows the account when the user unticks every
tool scope, and the ID token's `sub` survives an address change. The return route lives on the
deployment's own https name, even one that resolves only inside its private network, because the
browser, not Google, follows the redirect.

A renewal advances the connection's removal counter, so a refresh that began before it saves nothing
and revokes nothing, and a check that began before it keeps the scopes the consent found. The
renewal also moves the tokens in the live own-value set from the consent's credential to the
connection, so a Forget clears them. A renewal that reaches a new address keeps it under a new
reference beside the older one, so a decision under an older snapshot still sees only the older
address, as [places](../policy/places.md) explains. A Forget erases every address.

After `ACCOUNT_MISMATCH`, `FORGET_IN_PROGRESS` or a connection forgotten during the consent, the
module keeps no token and makes one revocation attempt, unless a live connection reaches the same
account, because Google's revocation ends the whole grant. The same holds for a token response with
no refresh token and for an abandoned credential that the sweep ends. A sweep at start and each hour
deletes lapsed requests, requests whose key is gone, and the credentials that no finished consent
claimed.

## Fewer scopes

The check makes one call per scope after each consent and once a day. A scope Google did not grant
is `not_granted`, and one whose API the project has not enabled is `api_disabled`. A quota answer,
such as `userRateLimitExceeded`, carries nothing about the scope, so the check fails and keeps what
the last check found. The connection keeps the result as `missing`, and the daily check clears it. A
tool is held back when every live connection lacks at least one scope of the tool. The tool endpoint
reads the held-back list again for each tool list and each call, so a conversation follows a consent
that changes it.

## The fetcher

The fetcher the store hands to tools refuses the token, revoke and authorize hosts and every
`/oauth2/` path, so a tool never reaches an endpoint that issues or ends a grant. The store's own
token requests are not affected.

## The web client

[The connections pages](../channels/client.md#the-connections-pages) call these procedures: the
setup steps, the client form, Connect, the connections list with its states, the missing-scope
notice and Forget with its status.

## Tests

The suites run against a fake Google from `@heynixie/connections/test-utils`. The suite in
`integration/google-consent.test.ts` runs the web return route, the API, the connections module and
the fake Google together.

The verify journey `google-connections` runs the same flow in a local test build. The harness serves
a fake Google, and [the test build](../core/crash-tests.md#the-test-build) reaches Google's
endpoints there.
