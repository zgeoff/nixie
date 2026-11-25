# Google connections

A Google connection reaches one Google account through an OAuth client that the user registers. The
connections module owns the client, the consent that makes a connection, and the procedures the web
client calls. [The credential database](credential-database.md) covers where the module keeps each
sealed value, and [the credential store](credentials.md) covers the token exchange and the refresh.

## The OAuth client

The user registers one client per connector with `connections.registerClient`. The call passes the
`Origin` header of the request beside the origin it registers, and the module refuses an origin that
is not https, carries a path, query or user name, or differs from the header. The redirect URI is
that origin plus the connector's return path, so Google checks it against the client exactly. The
client secret is sealed at once and never read back.

`removeClient` refuses while a connection or an unlapsed consent uses the client. The API's checked
actions hash their input, and `registerClient` leaves the secret out of that hash.

## The consent

1. `startConsent` makes a consent request bound to the device session that called it, with a random
   `state`, a PKCE verifier sealed under a key of its own, and an expiry of 10 minutes. It answers
   the authorize URL, which always carries a S256 challenge and `prompt=consent`.
2. Google sends the browser to `/connections/google/return`, a web server route. The route calls
   `connections.finishConsent` with the browser's session as a bearer token, and never logs the
   query string. A success answers 303 to the connection's page, and a failure renders a page with
   status 400 that names the error code and Google's own code.
3. `finishConsent` claims the request once, deletes the verifier's key, and exchanges the code into
   a fresh credential of its own. The account comes from the ID token.
4. The module reads each scope once, then decides: a new account becomes a new connection, an
   account a live connection reaches moves the new token into that connection, and an account under
   a Forget waits up to 30 seconds for it. A token response with no refresh token keeps nothing.

After `ACCOUNT_MISMATCH`, `FORGET_IN_PROGRESS` or a connection forgotten during the consent, the
module keeps no token and makes one revocation attempt, unless a live connection reaches the same
account, because Google's revocation ends the whole grant. A sweep at start and each hour deletes
lapsed requests and the credentials that no finished consent claimed.

## Fewer scopes

The check reads one call per scope after each consent and once a day. A scope Google did not grant
is `not_granted`, and one whose API the project has not enabled is `api_disabled`. The connection
keeps the result as `missing`, and the daily check clears it. Each run's tool endpoint leaves out
each tool whose scope every live connection lacks.

## The fetcher

The fetcher the store hands to tools refuses the token, revoke and authorize hosts and every
`/oauth2/` path, so a tool never reaches an endpoint that issues or ends a grant. The store's own
token requests are not affected.

## Tests

The suites run against a fake Google from `@heynixie/connections/test-utils`. The suite in
`integration/google-consent.test.ts` runs the web return route, the API, the connections module and
the fake Google together.
