# Google connections

- **Status:** draft
- **Work items:** [the connections](https://linear.app/zgeoff/issue/GEO-1824). The callback waits on
  [the OAuth return spike](https://linear.app/zgeoff/issue/GEO-267).
- **Decision records:** [0010](../../decisions/0010-oauth-clients.md),
  [0007](../../decisions/0007-crypto-shredding.md)

You connect a Google account from the web client. You register your own OAuth client once, consent
on Google's page, and Google sends your browser back to nixie, which keeps the tokens encrypted
under a key of the connection's own. nixie refreshes the tokens, shows each connection's status, and
offers one removal, Forget: it revokes the grant at Google and deletes the connection's key, so the
tokens are unreadable in the database and, once the key repo prunes, in every backup. Using the
account again needs a fresh consent.

This design builds the [credential store](../platform/connectors/credentials.md) on its database
backend and the [connector interface](../platform/connectors/connector.md) for one connector,
Google. A Google connection has no Disconnect. The Gmail, Calendar and Drive tools, and the polls,
belong to their own work items.

## Shape

```mermaid
flowchart LR
  web[web client] -->|"1. connections.startConsent"| api[API]
  api -->|"2. consent URL with state"| web
  web -->|"3. consent"| google[Google consent page]
  google -->|"4. GET the return route"| route[web server return route]
  route -->|"5. connections.finishConsent"| api
  api -->|"6. code for tokens"| token[Google token endpoint]
  api -->|"7. one read per scope"| apis[Gmail, Calendar, Drive]
  api -->|"8. connection.connected"| log[event log]
```

## Contracts

### The connector

```ts
// connectors module. Extends the Connector of the connector design.
const googleConnector: Connector = {
  id: 'google',
  auth: googleOAuth,
  setup: googleSetup, // see "The setup steps"
  // …existing fields: actions, polls, check
};

interface OAuthSpec {
  kind: 'oauth';
  authorizeURL: string; // 'https://accounts.google.com/o/oauth2/v2/auth'
  tokenURL: string; // 'https://oauth2.googleapis.com/token'
  revokeURL: string; // 'https://oauth2.googleapis.com/revoke'
  identityScopes: string[]; // ['openid', 'email']: the account, whatever else you untick
  authorizeParams: Record<string, string>; // { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }
  hosts: string[]; // ['gmail.googleapis.com', 'www.googleapis.com']; never a URL above
  returnPath: string; // '/connections/google/return'
}

interface SetupStep {
  id: string; // stable, such as 'client'; the guide's sections match these one to one
  title: string;
  body: string; // template text; {redirectURI} and {origin} are the only placeholders
  links: { label: string; url: string }[];
  input?: 'oauth_client'; // the step that shows the client form
}
```

The account comes from the ID token in the token response, never from `check`. Google sends the ID
token straight to nixie over TLS, so nixie reads its `sub` and `email` claims without checking a
signature. `sub` is the account's identity and `email` is its account name.

### The setup steps

The web client shows these steps in order, from the connector's data:

| `id`       | Title                         | What it says                                                                                                                                           |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project`  | Create a Google Cloud project | Create one project for this nixie alone. A revocation reaches every client of a project, so 2 deployments on one project forget each other's grants.   |
| `apis`     | Turn on the APIs              | Enable the Gmail, Google Calendar and Google Drive APIs, one link each.                                                                                |
| `branding` | Fill in the branding          | Give an app name, your email, and a home page and a privacy policy URL on a domain you control, such as a project site. Publishing needs both URLs.    |
| `audience` | Publish the app               | Choose External, then publish to production with no test users. Testing status ends consent after 7 days.                                              |
| `client`   | Create a web client           | Create a Web application client with `{redirectURI}` as its only redirect URI, then paste its client ID and secret here. Google shows the secret once. |
| `consent`  | Connect an account            | Consent on Google's page. An account that does not own the project sees "Google hasn't verified this app" first.                                       |

The links point at the Google Auth Platform pages of the console: Branding, Audience and Clients,
and the API library page of each API. The owner's guide is `docs/guides/google.md`. It holds the
same 6 steps under the same titles, each with what to click, plus a section on the warning page and
a section on revoking a grant by hand at your Google Account's third-party access page. The guide
and the step data ship in one PR.

### The API

```ts
// libs/contract, under `connections`. Every action is a checked action.
connections.registerClient({
  clientActionID,
  connector: 'google',
  clientID,
  clientSecret,
  origin: 'https://nixie.example.org',
});
// → { client: 'q7m2x9k4ta', redirectURI: 'https://nixie.example.org/connections/google/return' }
//   or INVALID_ORIGIN (not https, or holds a path, a query, a user name or a port that differs from the page's)
//   or CLIENT_EXISTS: one client per connector; remove the old one first

connections.removeClient({ clientActionID, client: 'q7m2x9k4ta' });
// → ok, or CLIENT_IN_USE while a connection that is not forgotten uses it

connections.startConsent({ clientActionID, connector: 'google', connection: null });
// → { consentURL: 'https://accounts.google.com/o/oauth2/v2/auth?…&state=…', expiresAt }
//   connection: a short ID consents again for that connection, for needs_consent or missing scopes
//   or CLIENT_MISSING, CONNECTION_NOT_FOUND

connections.finishConsent({ state, code: '4/0Ab…', error: null });
// → { connection: 'k3x9m2p7qa', missing: [{ scope: 'gmail.modify', reason: 'not_granted' }] }
//   or CONSENT_NOT_FOUND: unknown, used, lapsed, or started by another device session
//   or CONSENT_REFUSED: Google returned an error, such as access_denied
//   or TOKEN_EXCHANGE_FAILED { googleError: 'invalid_client' }: from a fixed set, never free text
//   or NO_REFRESH_TOKEN, ACCOUNT_MISMATCH

connections.setLabel({ clientActionID, connection: 'k3x9m2p7qa', label: 'Work' });
// → ok, or LABEL_TAKEN under the rule of the connector design

connections.forget({ clientActionID, connection: 'k3x9m2p7qa' });
// → { erasure: 'pending', revocation: 'pending', backup: { state: 'pending' } }

connections.readForgetStatus({ connections: ['k3x9m2p7qa'] });
connections.list();
// → [{ connection, connector, label, account, status, reason, statusSince, lastSuccessAt,
//      scopes, missing, fingerprint, lastUsedAt, forget: null | { erasure, revocation, backup } }]
```

```ts
// libs/contract
type Erasure = 'pending' | 'done';
type Revocation = 'pending' | 'confirmed' | 'refused' | 'unknown' | 'not_attempted';
type MissingScope = { scope: string; reason: 'not_granted' | 'api_disabled' };
// backup: forgetBackupSchema, as built
```

- The input hash of `registerClient` leaves `clientSecret` out, and the input hash of `setLabel`
  leaves `label` out, as a message send keeps no hash of its text. A hash would outlive a Forget and
  confirm a guess at the label. A retry with the same ID returns the first result and stores
  nothing.
- A retry of `startConsent` returns a fresh `state` and consent URL that replace the first, with the
  first's lapse time, as a code issue retry does
  ([checked actions](../../architecture/channels/api.md#checked-actions)).
- `finishConsent` is keyed by `state`, not by a client action ID. A second call with a used `state`
  answers `CONSENT_NOT_FOUND`.

### The return route

```http
GET /connections/google/return?state=…&code=4/0Ab…&scope=… HTTP/1.1
Cookie: <the device session>

HTTP/1.1 303 See Other
Location: /settings/connections/k3x9m2p7qa
Cache-Control: no-store
Referrer-Policy: no-referrer
```

The web server serves the route, because every path outside `/rpc` reaches it. Its server handler
calls `connections.finishConsent` with the browser's session as a bearer token, as a render does
([the client path](../../architecture/overview.md#the-client-path)). On success it answers 303 to
the connection's page, which shows `missing`. On a refusal it renders the error page with
status 400. The API keeps its rule that every procedure is a `POST` with the client header.

### The tables

```text
oauth_clients            plain table, connections module
  oauth_client_id        text  random UUID
  short_id               text  createShortID
  connector_id           text  'google'
  google_client_id       text  plain; it is no secret
  key_id                 text  random UUID in the key store; seals the secret
  secret_sealed          blob
  secret_fingerprint     text  8 hex digits of SHA-256
  redirect_uri           text  origin + returnPath, fixed at registration
  created_at             int
  removed_at             int?  the key is gone

connections              plain table, connections module
  connection_id          text  random UUID
  short_id               text  createShortID
  connector_id           text
  oauth_client_id        text  FK
  key_id                 text  random UUID in the key store; seals every *_sealed column
  account_sealed         blob  { sub, email }
  label_sealed           blob
  refresh_token_sealed   blob
  token_fingerprint      text  of the refresh token; changes on rotation and on consent again
  refresh_expires_at     int?  from refresh_token_expires_in, for time-based access
  granted_scopes         text  JSON array
  missing_scopes         text  JSON array of MissingScope
  status                 text  active | failing | needs_consent | expiring | forgotten
  status_reason          text? unauthorised | service_error | no_answer
  status_since           int
  last_success_at        int?
  binding                text  enabled | removing | removed
  removal_counter        int   0 at creation
  created_at             int

consent_requests         plain table, connections module
  consent_id             text  random UUID
  state_hash             text  SHA-256 of the state; the state is 32 random bytes
  device_session_id      text  the identity row that started it
  oauth_client_id        text
  connection_id          text? set when consenting again
  scopes                 text  JSON array asked for
  key_id                 text  seals the PKCE verifier
  verifier_sealed        blob
  expires_at             int   10 min after the start
```

- Every sealed value binds its key ID, its table and its column as additional data, as
  [erasable fields](../../architecture/core/erasable-fields.md#keys) do.
- Each key is a row of `record_keys` in `keys.db`, so the key repo carries it and a Forget deletes
  it with the existing removal and checkpoint.
- The binding of the credential design lives on the connection row, because a Google connection has
  one credential and one binding.
- Access tokens stay in the server's memory, keyed by connection ID and removal counter, and never
  reach a table, a record or a log.

### The records

```ts
// connections module. Every kind is on no thread, holds no free text, and gets no key.
type ConnectionRecord =
  | { kind: 'connection.client_registered'; client: string; fingerprint: string }
  | { kind: 'connection.client_removed'; client: string }
  | {
      kind: 'connection.connected';
      connection: string;
      shortID: string;
      scopes: string[];
      missing: MissingScope[];
      fingerprint: string;
      again: boolean;
    }
  | { kind: 'connection.label_set'; connection: string }
  | {
      kind: 'credential.refreshed';
      connection: string;
      counter: number;
      fingerprint: string;
      rotated: boolean;
    }
  | { kind: 'credential.status_changed'; connection: string; status: string; reason: string | null }
  | { kind: 'connection.forget_started'; connection: string; counter: number }
  | { kind: 'connection.revocation_started'; connection: string }
  | {
      kind: 'connection.revocation_recorded';
      connection: string;
      outcome: Revocation;
      status: number | null;
      googleError: string | null;
    }
  | { kind: 'connection.forgotten'; connection: string };
```

No record of these kinds holds a label, an account address or a `sub`, so the connection's key
covers every copy that the connection itself keeps. The
[status line](../platform/connectors/tools.md#what-the-model-learns-about-a-connection) reads the
label from the connection row.

## Constraints

### Consent

- `startConsent` asks for the identity scopes and the scopes of the connector's actions, with
  `state`, PKCE S256 and `authorizeParams`. `prompt: 'consent'` makes Google issue a refresh token
  on every consent, the one after a Forget included.
- `state` is bound to the device session that started it. A call from another session, or after
  `expires_at`, answers `CONSENT_NOT_FOUND`, so a link that an attacker sends you cannot attach the
  attacker's account.
- The token exchange sends the client secret, the PKCE verifier and the stored `redirect_uri`. The
  security of the return rests on `state` and the client secret, never on PKCE.
- `finishConsent` deletes the consent request and its key in the transaction that records the
  outcome, success or refusal. A sweep at start and every hour deletes each lapsed request and its
  key.
- A token response without a refresh token answers `NO_REFRESH_TOKEN` and keeps nothing.
- A consent that reaches an account a live connection of the client already reaches updates that
  connection, as a consent again does. A consent again for connection X that reaches another account
  answers `ACCOUNT_MISMATCH`.
- A consent again replaces the refresh token, the scopes and `missing`, sets `active`, and advances
  the removal counter, so a refresh that started with the old token saves nothing.
- When `finishConsent` holds a refresh token it does not keep, it makes one revocation attempt,
  unless a live connection of the client reaches the same account, because Google's revocation
  reaches the whole grant.
- The return route's handler and the web server's request log never record the query string.

### Fewer scopes

- `check` makes one read call per action scope. A scope Google did not grant is `not_granted`. A
  scope whose call Google refuses because the project has not enabled its API is `api_disabled`.
- The connection keeps every granted scope that passed, and its tools join the registry. The
  endpoint leaves out each action whose scope is in `missing`.
- The connection's page shows each missing scope with its reason and the tools it holds back, and
  one button that runs `startConsent` for the connection. The notice stays until a consent clears
  `missing`.
- A connection with only the identity scopes still connects, and lists no tools.

### Refresh and use

- [Refresh](../platform/connectors/credentials.md#refresh) holds as written, with these mappings of
  Google's answers:

| Google answers                               | The store                                                        |
| -------------------------------------------- | ---------------------------------------------------------------- |
| a token, with or without a new refresh token | saves the rotation, records `credential.refreshed`, `active`     |
| `invalid_grant`, `admin_policy_enforced`     | `needs_consent`                                                  |
| `invalid_client`, `unauthorized_client`      | `failing` with `unauthorised`, at once                           |
| a 5xx, or no answer within 10 s              | backs off; `failing` with `service_error` or `no_answer` after 3 |

- A refresh saves only when the removal counter it read still holds, in the transaction that writes
  `credential.refreshed`, and a rotated refresh token goes in that same transaction.
- A crash after Google answers and before that commit loses a rotated refresh token. When Google has
  spent the old one, the next refresh gets `invalid_grant` and the connection becomes
  `needs_consent`. The crash test checks that outcome, and that the row keeps the old token whole.
- A connection whose `refresh_expires_at` falls within 3 days is `expiring`. Past it, the connection
  is `needs_consent`.
- The fetcher holds a shared lock on the connection for each request it sends. Forget takes the lock
  exclusive, after it aborts every request in flight on that connection. A request Google already
  received stays with Google.
- The fetcher refuses every URL in `OAuthSpec` above `hosts`, so no tool reaches the token or
  revocation endpoint.

### Tasks that already run

- The conversation's endpoint builds its tool list at each turn from the live connections, so a new
  connection, a Forget or a change in `missing` reaches the conversation at its next turn. The turn
  in flight keeps its list.
- A worker run keeps its list for its life. A job run keeps its pins, as
  [the connection argument](../platform/connectors/connector.md#the-connection-argument) sets.
- Every call checks the connection at the time of the call, so a call to a forgotten connection
  fails with the error for a `forgotten` credential, which names neither the connection nor its
  status.
- A job whose pins all name forgotten connections lists none of the connector's tools. The client's
  view of the job shows the forgotten pin.

### Forget

Forget is a durable operation, resumed at start before any runner claims work:

1. In the checked action's transaction: the binding becomes `removing`, the counter advances, the
   status becomes `forgotten`, and `connection.forget_started` commits. The store refuses every
   fetch and refresh from here.
2. `connection.revocation_started` commits. nixie sends the refresh token to `revokeURL` once, with
   a 10 s timeout. `connection.revocation_recorded` commits the outcome: 200 is `confirmed`, 400 is
   `refused` with Google's error code, and anything else is `unknown`.
3. nixie deletes the connection's key and checkpoints the key store, then clears the sealed columns.
   It runs the conversation's
   [session cleanup](../../architecture/memory/context.md#forgetting-and-the-live-session), as a
   memory forget does. The cleanup deletes every session summary and opens a new session, so no
   status line or connection argument that named the connection reaches a later turn. It then
   commits `connection.forgotten` with the binding `removed`.

- A start that finds `revocation_started` with no outcome records `unknown` and sends nothing, so
  the revocation is never sent twice.
- A start that finds `forget_started` with no `revocation_started` makes the attempt.
- The key goes only after the outcome commits, because the revocation needs the refresh token.
- A connection whose key the key store lacks, such as after a restore, skips step 2 with
  `not_attempted` and finishes step 3.
- The client shows erasure, revocation and backup state apart. It shows a revocation that is not
  `confirmed` with the guide's section on revoking by hand.
- A forgotten connection keeps its row, with its short ID and scopes and no sealed value, so a job
  pin can name it.
- Forget erases nixie's own copies of the connection: its tokens, label and account. Text that names
  the account elsewhere, such as a message, a summary, a tool result or an email, keeps its own key,
  and you remove it with the forget of that record.
- `removeClient` deletes the client's key and checkpoints, and needs no revocation: Google keeps the
  client until you delete it in the console.

### Backups and resets

- `connection.forgotten` joins the forget records that make a forget set due, and
  [a forget's backup state](../../architecture/deployment/backups.md#a-forgets-backup-state) reads
  from it.
- A full [reset](../../architecture/core/event-log.md#the-reset) makes one revocation attempt per
  live connection before it deletes the keys, 10 s each, and its answer lists each outcome. A failed
  attempt never stops the reset. A reset of the conversation leaves connections alone.
- A restore of a data copy from before a Forget meets a connection whose key is gone, and finishes
  its Forget with `not_attempted`.
- A restore of a data copy from before a connection existed loses the connection, and its grant
  stays live at Google with no token in nixie. The restore steps tell you to check the third-party
  access page of each Google account you connected.

### A rollback

| The change                          | The release before                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| the migration of the 3 tables       | starts on it, because it only adds tables, and never selects them                     |
| the keys in `record_keys`           | keeps them, and its full reset deletes them                                           |
| the 10 record kinds                 | never meets them on a thread, and folds none                                          |
| `connection.forgotten` as a forget  | stages no forget set for it, so the next scheduled set covers the Forget              |
| the procedures and the return route | has neither; a consent in flight lands on a 404, and the next start's sweep clears it |

- The design adds no config key.
- A Forget left part way finishes at the next start of a release that has this design. Before a
  rollback, wait until every Forget shows erasure `done`.

## Decisions

- **Forget only, no Disconnect.** The owner chose this on 13 Nov: a pause is rare for one person,
  and a paused token still sits in the database and its backups.
- **The account comes from the ID token, with `openid` and `email` asked for.** An agent's call on
  13 Nov: Google shows sign-in scopes on a page of their own, so the account is known when you
  untick Gmail, and `sub` survives an address change.
- **Connections are plain tables beside audit records, not projections.** An agent's call on 13 Nov:
  a token changes at runtime, and a projection would put every value into the append-only log.
- **Label, account and tokens sit under the connection's key, and no record carries them.** An
  agent's call on 13 Nov: Forget then erases every copy the connection keeps, and a hash of the
  account would outlive it, as a message hash would.
- **The return route is a web server route that calls a procedure.** An agent's call on 13 Nov: the
  API keeps one way in, and the browser's `Lax` cookie reaches a top-level navigation from Google.
- **The redirect URI comes from the page's origin at registration, not from a config key.** An
  agent's call on 13 Nov: Google checks it against the client anyway, and a rollback needs no step.
- **Access tokens stay in memory.** An agent's call on 13 Nov: a restart costs one refresh, and the
  database holds one secret per connection.
- **One revocation attempt, recorded before it is sent.** An agent's call on 13 Nov: a crash then
  reads as `unknown` and never sends a second request.
- **A consent of an account already connected updates that connection.** An agent's call on 13 Nov:
  a refusal would leave a second grant at Google, and revoking it would revoke the first.

## Builder decides

- Internal names, file layout, and which module holds the store's code beside its tables.
- The wording of each error, of the setup steps' bodies and of the guide.
- The read call that `check` makes per scope, within the tools' design.
- How the fetcher's lock and abort are built, within the constraint.
- The layout of the tests, and the kill points of the crash tests.

## Out of scope

- The Gmail, Calendar and Drive tools and the polls:
  [Gmail](https://linear.app/zgeoff/issue/GEO-1825) and
  [Calendar and Drive](https://linear.app/zgeoff/issue/GEO-1826).
- A Disconnect or a pause for a Google connection.
- A second OAuth client per connector, and connectors from other providers.
- Picking Drive files for `drive.file`.
- Finding and forgetting the records whose text names a forgotten account.

## Open questions

- **Does Google accept the private-network HTTPS callback, and PKCE on a Web application client?**
  [The OAuth return spike](https://linear.app/zgeoff/issue/GEO-267) settles it. Until then the
  return route is built as here, and the guide says the redirect URI's host needs a name under a
  public suffix.
- **The names: the `connections` procedures, the record kinds, "Settings → Connections" and the
  return path.** The owner settles them in
  [the connections issue](https://linear.app/zgeoff/issue/GEO-1824). Until then the names here hold.
- **Where the fewer-scopes notice shows.** The owner settles it in the same issue. Until then it
  shows on the connection's page and in the connections list, never in the conversation.
