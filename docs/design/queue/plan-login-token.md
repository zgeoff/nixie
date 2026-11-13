# The ChatGPT plan login

- **Status:** draft
- **Work items:** [Codex tasks on a ChatGPT plan login](https://linear.app/zgeoff/issue/GEO-2238)

A task on the Codex harness can run on your ChatGPT plan in place of an OpenAI API key. The counting
proxy holds the plan's refresh token in a file of its own on the host, refreshes it, and sets the
access token on each request of the plan's route. The nixie server and every sandbox hold only
placeholders, so every plan request passes the proxy's count and its spending stop.

Terms:

- A **plan login** is one sign-in to a ChatGPT account. The proxy holds one for each plan route.
- A **plan route** is a counting proxy route that holds a plan login.
- A **plan profile** is a `codex` model profile whose requests go to a plan route.
- The **login file** is the file in which the proxy keeps a plan route's login.
- The **operator** is the person who runs commands on the host.
- The **release before** is the nixie release, or the proxy release, that a rollback returns to.

The counting proxy, its control listener, the model secrets' upstream and the spending stop are in
`docs/design/queue/budgets-and-hard-stop.md`. The proxy as built is in
[the counting proxy](../../architecture/policy/counting-proxy.md). The Codex guest, its config and
the `codex` profile are in [the Codex harness](https://linear.app/zgeoff/issue/GEO-2237) work item.

## Shape

```mermaid
flowchart LR
  op[operator] -->|"counting-proxy login"| proxy[counting proxy]
  proxy <-->|"device code, refresh"| auth[auth.openai.com]
  guest[Codex guest] -->|"placeholder"| broker[impd broker]
  broker --> proxy
  proxy -->|"plan access token"| backend[ChatGPT Codex backend]
  server[nixie server] -->|"GET /logins"| proxy
```

## Contracts

### The proxy's plan route

```yaml
# counting proxy config, under routes
codex-plan:
  api: openai-responses
  upstream: https://chatgpt.com/backend-api/codex # the proxy adds the rest of the path
  model: gpt-6-luna
  prices: { … } # the profile's prices
  login: # makes this a plan route
    file: /var/lib/counting-proxy/logins/codex-plan.json
    routeKeyFile: /run/secrets/codex-plan-route-key # one line; the plan profile's impd secret value
```

```ts
// wire library, the endpoint table: openai-responses also takes the path Codex sends
'openai-responses': [
  { name: 'responses', method: 'POST', path: /^(?:\/v1)?\/responses$/u },
  modelsEndpoint,
],
```

### The login file

```ts
// counting proxy: the login file, mode 0600, which only the proxy's user reads
interface LoginFile {
  version: 1;
  loginID: string; // random; a new login gets a new one
  refreshToken: string;
  accountID: string; // the ChatGPT account ID, from the ID token
  planType: string; // such as 'plus', from the ID token
  email: string; // from the ID token
  status: 'active' | 'failing' | 'needs_login';
  reason: 'refused' | 'service_error' | 'no_answer' | null; // why the status is not active
  statusSince: string; // ISO time
  lastRefreshAt: string | null;
}
```

- The access token lives only in the proxy's memory. A start of the proxy refreshes each plan login
  before it admits that route's first request.

### The host commands

```bash
counting-proxy login --config <config file> --route codex-plan
# → Open https://auth.openai.com/codex/device and enter the code ABCD-1234 (expires in 15 minutes).
#   Signed in: someone@example.com, plan plus. Stored for codex-plan.
counting-proxy logout --config <config file> --route codex-plan
# → Removed the login for codex-plan. Sign this device out in ChatGPT's security settings.
```

### The control listener

```http
GET /logins
Authorization: Bearer <control token>

200 {
  "codex-plan": { "status": "active", "reason": null, "since": "2026-11-13T09:12:00Z",
                  "accountID": "…", "planType": "plus" }
}
```

- An entry holds no token and no email. A plan route with no login file shows
  `{ "status": "needs_login", "reason": null, … }`.

### nixie's side

```yaml
# deployment config, under models.profiles: a codex profile with one more key
codex-plan:
  harness: codex
  base_url: https://chatgpt.com
  credential: deployment:codex-plan # names the impd secret, as every model profile does
  plan_login: true # its requests go to a plan route; the route ID is the profile ID
  model: gpt-6-luna
  effort: low
  prices: { … }
```

```ts
// wire library, the codex member of the turn profile: one more field
chatgptLogin: { accountID: string; planType: string } | null; // null on an API key profile

// codex guest: the login before the first thread
await appServer.request('account/login/start', {
  type: 'chatgptAuthTokens',
  accessToken: placeholderJWT, // unsigned; claims: account ID, plan type, exp a day ahead
  chatgptAccountId: profile.chatgptLogin.accountID,
  chatgptPlanType: profile.chatgptLogin.planType,
});
// When Codex sends the guest account/chatgptAuthTokens/refresh, the guest answers at once with
// a new placeholderJWT in the same 3 fields.
```

```ts
// spend module: the read the server makes beside the watcher's read of /status
const logins = await readPlanLogins(context);
// → { 'codex-plan': { status: 'active', accountID: '…', planType: 'plus' } }
//   or { state: 'unreachable' }
```

## Constraints

### The path of a plan request

| Hop                | The URL it sends                                                       |
| ------------------ | ---------------------------------------------------------------------- |
| The Codex guest    | `https://chatgpt.com/<sandbox>/codex-plan/responses`, to the broker    |
| The broker         | the same path, to the proxy's model address, the secret's upstream     |
| The counting proxy | strips `/<sandbox>/codex-plan`, sends `/responses` to the route's URL  |
| The upstream       | `https://chatgpt.com/backend-api/codex/responses`, with the plan token |

- The base URL in the turn frame is `https://chatgpt.com/<sandbox>/<profile ID>`, as the budgets
  design builds every base URL. A plan profile's `base_url` is `https://chatgpt.com`, and the schema
  refuses another value.
- The impd secret of a plan profile holds the route key: 32 random bytes, in hex, that only that
  secret and the proxy's `routeKeyFile` hold. The deployment adds the secret as it adds every model
  secret, with the proxy's model address as its upstream and the path filter `/<sandbox>/**` on each
  grant.
- The proxy refuses with a 403 a request on a plan route whose `Authorization` is not
  `Bearer <route key>`, compared in constant time, and sends nothing upstream. The broker sets that
  header only for a sandbox granted the plan profile's secret, so a sandbox with another model grant
  cannot reach the plan route by naming it in its path.
- The broker refuses with a 403 each other ChatGPT path that Codex calls, such as
  `/backend-api/wham/accounts/check`, because the path filter does not cover it.
- When the broker's 403 on such a path fails a turn of the pinned Codex CLI, the build of the Codex
  guest stops, and its builder reports to the owner.

### The proxy

- On a plan route, after the route key check, the proxy removes the `Authorization` header it
  receives and sets `Authorization: Bearer <access token>`. It sets no credential on any other
  route.
- The proxy reads a plan login's refresh token only to refresh it, and sends it only to the token
  endpoint. It sends the access token only to its plan route's upstream.
- A request on a plan route whose login is not `active` gets a 401 in the Responses error shape, and
  the proxy sends nothing upstream.
- The proxy refreshes a login 5 minutes before its access token's expiry, at least every 7 days, and
  at its own start, one refresh per login at a time. A request on the route waits for a refresh in
  flight.
- When the upstream answers 401 on a plan route, the proxy starts a refresh before it passes the 401
  on, so a request that Codex sends again waits for the new token. It refreshes after a 401 only
  when the access token is at least 5 minutes old, so a guest drives at most one refresh in 5
  minutes.
- The refresh posts to the token endpoint, with the client ID, of the Codex CLI that the `codex`
  image pins.
- The proxy writes a rotated refresh token to the login file, through a second file and a rename,
  before it uses the new access token. It writes only while the file's `loginID` is the one it read
  before the refresh, under a lock on the file that `login` and `logout` take too. A refresh that
  began before a new login or a logout therefore writes nothing.
- An answer of `refresh_token_expired`, `refresh_token_reused`, `refresh_token_invalidated` or
  `invalid_grant` sets the status `needs_login` with the reason `refused`. After 3 refreshes in a
  row that got a 5xx, the status becomes `failing` with `service_error`, and after 3 with no answer
  in 10 s, `failing` with `no_answer`. The proxy retries a failing refresh with backoff.
- When the answer to a refresh is lost, or the proxy stops after OpenAI answers and before the
  rename, OpenAI may have spent the stored refresh token. The next refresh then gets a refusal, and
  the status becomes `needs_login`. A test checks that the login file still holds the old token
  whole.
- The model listener serves no login path, and the control listener serves `GET /logins` only.

### The login

- `counting-proxy login` runs OpenAI's device code flow, with the endpoints and the client ID of the
  pinned Codex CLI. It prints the URL, the code and its expiry, and opens no browser.
- When the sign-in ends, the command writes the login file with a new `loginID`, and prints the
  email and the plan. It prints no token.
- A login for a route that already has one replaces the login file.
- The proxy reads the login file's `loginID` before it admits each request on a plan route. When the
  `loginID` differs from the one its access token came from, the proxy drops that access token and
  refreshes before it sends the request. When the file is gone, the proxy answers 401 and sends
  nothing upstream.
- `counting-proxy logout` removes the login file. OpenAI documents no revocation endpoint for this
  sign-in, so the command tells the operator to sign the device out in ChatGPT.
- Device code login must be on in the account's ChatGPT security settings. When OpenAI refuses the
  code request, the command prints that the setting is off.

### nixie

- The server holds no plan token. It reads `GET /logins` each time it reads `/status`, and puts the
  route's account ID and plan type in each turn profile of the plan profile.
- The schema refuses `plan_login: true` without `spendStop`, because the server reads the logins
  through the control listener.
- When the profile's login is not `active`, the runner fails each step on the plan profile with
  `model_auth`, and the client shows that the operator must run `counting-proxy login`.
- The Codex guest logs in with `chatgptAuthTokens` before its first `thread/start`, and writes no
  `auth.json`. Its config sets `cli_auth_credentials_store = "ephemeral"`,
  `forced_login_method = "chatgpt"` and `requires_openai_auth = true` on its model provider.
- The placeholder JWT holds the account ID, the plan type and an `exp` a day ahead. It holds no
  email and no signature.

### Spending

- Every plan request passes the proxy, so the day and month counts, the per-sandbox limits and the
  stop cover plan turns as they cover every other profile.
- On a plan route, the proxy refuses with a 400 a body that sets `service_tier`, so no plan request
  runs at a faster tier that spends credits at a higher rate than the route's prices count. The
  guest's config sets no service tier.
- The proxy prices plan turns with the route's prices. A plan has no price per token, but Codex
  usage past a plan's limit can draw on bought credits, so the dollar limit bounds that spend too.

### A rollback

| The change                         | The release before                                      |
| ---------------------------------- | ------------------------------------------------------- |
| a route's `login` key              | the proxy before refuses to start: its schema is strict |
| the login file                     | the proxy before never reads it                         |
| `/responses` in the endpoint table | the proxy before refuses that path with a 403           |
| `GET /logins`                      | nixie before never calls it                             |
| a profile's `plan_login` key       | nixie before refuses to start: its schema is strict     |
| `chatgptLogin` in the turn profile | nixie before never sends it                             |

To roll back:

1. Remove each plan profile and its `selectable` entries from nixie's config, and each route's
   `login` key from the proxy's config.
2. Start the proxy before, then nixie before. Expect: both start. Each login file stays on disk, so
   a later release that reads it keeps the login. Remove a login file to end the login.

## Decisions

- **The counting proxy holds the plan login.** The server holds no model credential while the stop
  is set, so a plan login in the server would let nixie's own code reach ChatGPT past the count. The
  proxy already sits on every plan request.
- **The login runs as a proxy host command, with a device code.** An agent's call on 13 Nov 2026: a
  device code needs no redirect to the host, so no token passes through the server. A login in a
  sandbox would put the refresh token in an imp.
- **Codex runs in external token mode, with no `auth.json`.** An agent's call on 13 Nov 2026: in its
  own mode the CLI refreshes a placeholder `auth.json` when the token nears its `exp` or after 2
  401s, as the
  [app-server spike](../../../research/codex-app-server/results.md#a-chatgpt-plan-login) measured.
  In external mode it asks the guest, and the guest needs to send nothing to the host.
- **impd's own refresh is unused.** An impd `oauth` secret takes no upstream, so its requests would
  reach ChatGPT past the count.
- **A refresh after a 401 waits 5 minutes since the last one.** An agent's call on 13 Nov 2026:
  ChatGPT can refuse a token before its expiry, and the floor keeps a guest from driving refreshes.
- **One plan login per route, and one route per plan profile.** An agent's call on 13 Nov 2026:
  OpenAI rotates the refresh token on each refresh, so 2 holders of one login spend each other's
  token.

## Builder decides

- The internal names of the refresh loop and the file lock.
- How the guest builds the placeholder JWT, within its claims.
- The wording of the commands' output, the errors and the client's notice.
- The layout of the tests.

## Out of scope

- An API key profile and the Codex guest itself, which the Codex harness work item builds.
- A change to imp.
- A plan login for the conversation role, which a `codex` profile cannot hold.
- A login from the web client.

## Open questions

The owner settles each one in [the plan login work item](https://linear.app/zgeoff/issue/GEO-2238),
and the interim stands until then:

- **Where does the one-time login run, and what does it show?** Interim: the host command
  `counting-proxy login --route <route ID>`, which shows the URL, the code and its expiry, then the
  account's email and plan.
- **The proxy holds the plan login, in place of nixie's credential store.** Decision 8 of the models
  design named the credential store. Interim: the proxy, for the reason in Decisions.
- **The names `plan_login`, `login`, `GET /logins` and `counting-proxy login`.** Interim: those
  names.
