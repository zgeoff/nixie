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
such as `30s` or `2m`. `google.break_notice` sets how long a broken connection stays broken before
[the events block](../core/conversation-turns.md#the-events-block) tells the model once more, and
takes a duration; it defaults to `2d`. The section holds the `gmail` section of earlier releases,
and a config that still has `gmail` at the top level fails to load. With no `google` section, nixie
has no Google:

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

## What a tool gets from a connection

The connections module hands a tool, an attempt or a check one value for each live connection:

```ts
interface ConnectorContext {
  connectionID: string;
  connection: string; // the short ID
  account: string; // the ID token's email, decrypted at each call
  fetch: typeof fetch; // the credential store's fetcher for this connection, limited to the connector's origins
}
```

`connections.readContext` takes the connection ID, a UUID, as the Gmail arrival source passes it,
and answers null when the connection is not live. The tool endpoint maps a short ID to the
connection ID before it calls. The Google connector holds the actions of every Google tool, so a new
tool adds its actions there. The default label of a Google connection is the ID token's `email`.

## Scopes and tools

| Scope                            | Tools that need it                                                             |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `gmail.modify`                   | every `gmail.*` tool                                                           |
| `calendar.events`                | every `calendar.*` tool except `calendar.list_calendars`                       |
| `calendar.calendarlist.readonly` | `calendar.list_calendars` (`calendar.events` does not cover the calendar list) |
| `drive.file`                     | every `drive.*` tool, and the Drive picker                                     |

Each action lists its scopes in `ConnectorAction.scopes`, and the held-back filter drops an action
whose scope is missing. A connection with only the identity scopes still connects and lists no
tools, and the user can add scopes later.

## Tasks in flight

The conversation's endpoint builds its tool list at each turn from the live connections, so a new
connection, a Forget or a change in `missing` reaches the conversation at its next turn. A worker
run keeps its list for its life. Every call checks the connection at the time of the call. A call to
a forgotten connection fails with the error for a `forgotten` credential, which never holds the
connection's label or status, because Forget erases them.

Forget erases a connection's Gmail wake rules and held arrivals as children of the connection,
through the `readChildren` of its erasable.

## Job pins

A task run of a definition keeps the connections its definition names for its life.

- The version of a definition holds `connections`, a map from a connector tool, such as
  `gmail.search`, to the short IDs of the connections that tool may use. A tool the map leaves out
  reaches every live connection. A definition with no `connections` key pins nothing.
- `task.define` takes `connections`, a list of short IDs, and pins each connector tool the task
  holds to those connections that hold the tool's scopes, so a job never reaches an account that
  lacks a tool's scope now and gains it later. An account holds a tool's scope only when the last
  check found every scope of the tool granted, so a tool that a release added after the account
  consented pins to no account until the account consents again. Before the decision point, the
  call's input is rewritten so `connections` holds the short IDs each listed connector tool is
  pinned to, whether the call named connections or not. A call that names a connection no listed
  tool can use ends there as an error, before it asks for any approval, because a list approved
  unresolved could resolve to other pins at save time. A call that reaches `run` with the list
  unresolved is refused with `connection_not_usable`. The approval shows those pins and the saved
  job holds the same pins, so an account that connects, or gains another tool's scope, while the
  approval waits never joins the job. A `task.yaml` may carry the same map under `connections`.
- A Google tool resolves its call against the pinned connections only. A call whose `connection`
  argument falls outside the pins fails with `NOT_PINNED` and lists the connections the task may
  use. With no argument, the tool picks among the pinned connections that are live.
- When the pins of a tool leave one live connection, the tool list drops the `connection` argument
  from that tool's schema. When they leave two or more, the schema lists each as one allowed value
  described by its label and account, and requires the argument.
- A tool whose pins all name forgotten connections is not listed, and a call to it fails.
- A worker run takes the pins of the run that started it, for the tools it holds, matched by the
  tool's registered name or the name the model sees. A task that a pinned run starts with
  `task.start` takes the pins of the tools it gets in its options, so it never reaches a connection
  its starter could not. A task that the user started, or that a run with no pins started, pins
  nothing.

## The status line

The first message of a session lists each connection that is `needs_consent`, `failing` or
`expiring`, and never one that is `forgotten`. A connection is `forgotten` from the moment its
Forget begins, so a Forget that waits on its revocation never lists the connection. A connection's
line holds its connector, label, account, status, reason, the time the status began, its last
success, the removed tools and where to reconnect, which is Settings → Connections. The removed
tools are the tools whose calls the status stops: a `needs_consent` connection stops every tool of
its connector whose scopes it holds, and a `failing` or `expiring` one stops none. The line names up
to 5 by name and counts the rest. A rule under the list tells the model when to raise each kind of
line.

- The entry renders nothing, and the session opens with no connections line, while every connection
  works.
- An `expiring` status starts a set time before the grant ends, and reaches `needs_consent` at its
  end. Neither moves the credential store's status, so an hourly sweep, `runStatusWatch`, writes a
  `connection.status_reached` record the first time the clock takes a connection into either. The
  sweep compares the status the clock reads with the one the store holds, so a failing connection
  whose grant ends still gets its record, and it runs at least 4 times in `google.break_notice`. A
  connection that the store marks `needs_consent` after its grant ended lists from the end of the
  grant.
- A task run of a definition reads the same entry, limited to the pinned connections and with no
  model credential, as an `<input name="connections">` block after the trigger. The block renders
  with the run's other blocks, in a new session or at the first step of a task run that nothing
  carries on.
- An expiring model credential joins the conversation's entry. A token from `claude setup-token`
  never refreshes, so the deployment's `model_credential` section names its `expires_at`, and the
  line appears from `warn_before` (3 days by default) before that time. The rule under the list
  tells the model to mention it once, unprompted.
- A connection whose account holds no address lists with its label alone. The removed tools are
  those whose scopes the last check found granted, so a tool whose scope the account never held is
  not listed as removed.

A status change reaches the model through the first message and the events block, and never through
the system prompt or the tool list, which hold the same text before and after it. The status stops
calls, and the tool list keeps listing the tools.

## Status events

[The events block](../core/conversation-turns.md#the-events-block) carries one line for each change
a connection makes, read from the log:

- a change into `needs_consent`, `failing` or `expiring`, from a `credential.status_changed` or a
  `connection.status_reached` record. The line gives the last success, the tools the status removed
  and where to reconnect;
- a return to `active` from any of them, from a `credential.status_changed` record or from the
  `connection.connected` record of a reconnect that renewed the connection. The line counts the tool
  calls that failed during the break, from the `connection.call_failed` records, and the job runs
  that started with the connection broken, from the `connection.run_without` records. Each count
  covers the calls that began, and the runs that started, from the break's start to the return, by
  their own times. A break that the clock began starts when the grant ended, not when the sweep
  wrote its record, and a reconnect that renews a grant that had ended counts from that end when no
  record of the break exists. A return from `expiring` alone counts none. A reconnect that renews a
  grant already within its window, before the sweep wrote the `expiring` record, still gives a
  return. A reconnect whose new grant ends within the window is no return: it is a change into
  `expiring`, or no line when the connection was `expiring` already;
- a break that passes `google.break_notice`, once per break, from the `connection.break_lasted`
  record that the sweep writes. A break begins at its earliest failing or consent step after the
  last return, or at the end of the grant when the store marked the connection later, and a consent
  step that the clock took counts from the end of the grant, so the notice falls due at that end
  plus the notice time whenever the sweep runs. A refresh that fails again never moves the start or
  repeats the record. The sweep runs at least 4 times in the notice time, and as often as every
  millisecond for a notice time that short.

A change into the status and reason that the connection already holds gives no line. Each line
leaves out its own time, because the events block puts the time before every line.

A model-originated call through a connection writes one `connection.call_failed` record, holding the
time the call began, when the call fails or answers a non-ok status while the connection is
`failing` or `needs_consent`, however many requests the call sends. A job run writes one
`connection.run_without` record for each pinned connection that is broken when the run opens. The
label and account of a line are read at render time, because no record holds them, so a forgotten
connection has no line. The events block never caps the entry, so no notice falls off a block that
the next turn moves past.

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
