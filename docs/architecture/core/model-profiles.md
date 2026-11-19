# Model profiles

nixie reaches every model through a model profile: a named route to one model on one model API
endpoint, with the harness that runs its turns, a reference to its credential, the model ID and an
optional price table. A profile also holds the fields that its harness's loop reads. An Agent SDK
profile adds the header that credential goes in, the reasoning effort, an optional context cap, a
prompt cache lifetime, a mark for a model outside Claude and an optional provider pin. Each model
role names the profile it uses, so moving a role to another model is a change to the deployment
configuration and never to code. [Conversation turns](./conversation-turns.md) covers how the
conversation runs its turns on its role's profile.

## The role map

The deployment configuration holds the profiles, each under its ID, and the role map: the
conversation, other tasks, workers and the checker. The models module owns the schema of that
section, and the server composes it into the root schema of the whole file, which refuses a key no
module reads, so a typo never passes as a default.

The conversation role is the one role nixie needs, and the schema refuses a file that leaves it
unset, so nixie stops at start rather than failing its first turn. A role left unset uses the
conversation's profile, so one setting gives a working deployment. The schema also refuses a role
that names a profile the file does not define.

The server reads the file once, at start. Every part then runs on one version of the settings, and a
change reaches nixie at its next start.

## Selectable models

The models section can also name selectable models: the models that a started task can run on in
place of the `task` role's profile. Each entry has a name, the profile it runs on, a description,
and an optional `ask: true`. The start tool shows the conversation the names as the choices of its
`model` option, each with its description, so the model chooses a name and never sees a profile, an
endpoint or a credential. An entry with `ask: true` stays out of the choices until the decision
point can ask before such a start
([GEO-1803](https://linear.app/zgeoff/issue/GEO-1803/nixie-policy-the-full-decision-point-with-destination-limits-known)).

The `worker.run` tool offers the same choices as its own `model` option, with the same names and
descriptions. A worker that names a selectable model runs on that entry's profile, and one that
names none runs on the `worker` role's profile ([workers](./tasks.md#workers)). Such a profile can
run a worker and can call one, so while the `worker` role is set, the schema checks the tool call
wait of each entry that has no `ask: true`: the harness must have one, and the worker run limit's
minutes must fit inside it. The error names the selectable model.

The schema refuses an entry whose profile the file does not define, and an entry whose profile has
no price table, because a task counts the cost of its turns against its dollar limit
([started tasks](./started-tasks.md#limits)). For the same reason, the schema refuses a config whose
task profile has no price table. A config that leaves the `task` role unset runs its tasks on the
conversation's profile, so that profile then needs a price table too.

The section's `limits.taskRun` sets the default and the max of a started task's limits, each as a
count of turns and an amount of dollars. The schema refuses a default above its max.

## Harnesses

A harness is the model loop that runs a profile's turns inside a sandbox, such as the Agent SDK.
Each profile names its harness under the required `harness` key, which has no default. The schema
refuses a profile with no `harness` key, or with a harness that has no definition. Its error names
the profile and lists each harness that has a definition, such as `harness: agent-sdk`.

The models module holds one definition for each harness that nixie runs, in a file of its own.
`bindHarness` turns a profile into a harness record, and host code reads the record for everything
that differs between harnesses. It never branches on a harness ID, and it reads a profile only as
the 6 fields that every profile has. Only a definition's `bind` reads a field of its own profile
type. The record holds:

- the capabilities the harness declares, and the header that carries the model secret;
- the turn profile for a kept session and for a one-off session, which nixie never resumes, such as
  a check's;
- the context window in tokens, or null on a harness without the `context-window` capability;
- the session, or null on a harness with no session. A session names a stored session point's owner,
  names the session for the logs and lists the session files;
- the model grant, and the placeholder credential the guest holds;
- the guest and the entry file for each of its loops, and the key of its image in the sandbox
  manifest;
- the model API the harness speaks;
- the MCP `_meta` key that carries the model's tool-use ID on each tool call;
- how long the harness's runtime waits for one tool call, which the host copies into each turn
  frame, or null when the harness declares none.

A definition gives a session exactly when the harness declares both `resume` and `resume-at-entry`,
and the type of the definition enforces it. The `agent-sdk` and `codex` harnesses have a definition.
Each profile schema holds only the keys its loop reads, so the schema refuses a key it does not
read.

A `codex` profile holds `harness`, `base_url`, `credential`, `model`, `effort`, `prices` and
`chatgpt_login`. `effort` is one of `low`, `medium`, `high`, `xhigh` and `max`. The harness runs the
Codex CLI's app server in a sandbox on the codex image, with nixie's tool route as the CLI's only
tool source. It has no session and no context window, so nixie sends it the whole history at each
step. It runs system tasks only, and has no conversation row yet. The CLI also lists 3 MCP resource
tools that nixie cannot remove, so a model on this harness sees them beside nixie's tools.

A profile with `chatgpt_login: true` runs on a ChatGPT plan login in place of an API key. Its
`base_url` is `https://chatgpt.com`, and the schema refuses another value. Its requests go to the
[model gateway's plan route](../policy/model-gateway.md#the-plan-route) of the same ID as the
profile, which holds the login. The turn profile then carries `chatgptLogin` with the account ID and
plan type, which the server reads from the gateway
([plan logins](../policy/spending-stop.md#plan-logins)).

The guest's config sets `cli_auth_credentials_store = "ephemeral"`,
`forced_login_method = "chatgpt"` and `requires_openai_auth = true` on the model provider, in place
of `env_key`. On a plan login, the guest turns on `experimentalApi` in the `initialize` handshake,
because the app-server refuses a `chatgptAuthTokens` login without it. Before its first thread, the
guest sends `account/login/start` with type `chatgptAuthTokens` and an unsigned placeholder token.
The token holds the account ID, the plan type and an `exp` a day ahead, and no email. The guest
answers each `account/chatgptAuthTokens/refresh` request at once with a new placeholder, and writes
no `auth.json`. In its own token mode the CLI would refresh with the placeholder refresh token and
fail the turn, so the guest runs it in external token mode. The guest sends no `service_tier`.

The guest's config sets `tool_output_token_limit` to the wire library's `toolOutputLimitTokens`, the
limit that the Agent SDK guest holds. A recall result of exactly the page limit, made of many small
items beside a filler, reaches the model whole at that value. A tool server that does not answer
within the guest config's `startup_timeout_sec` fails the turn with `tools_not_connected`. The guest
writes the turn frame's tool-call wait into `tool_timeout_sec` of nixie's tool server, in seconds,
and writes nothing when the wait is null. The `codex` harness record declares a wait, because the
test imp lane proves that the CLI gives the model a timeout error in place of a result that arrives
after the setting.

The wire library holds every harness ID and the features each harness declares, such as resuming a
session at an entry or returning structured output. Each role declares the features its loop needs,
and nixie checks a profile's harness against those needs in 2 places:

| Where             | What it checks                                                                                                     | On a misfit                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| The config's load | each role's profile, an unset role on the conversation's profile, and each selectable model against a task's needs | the schema refuses the file, naming the role or the selectable model, the profile and each missing feature |
| A task's start    | the chosen selectable model against a task's needs                                                                 | the start writes nothing, and tells the model each missing feature                                         |

The turn profile that the host sends a guest, and each session point, name their harness too. nixie
reads a stored session point that names no harness as an Agent SDK point. A point that the step's
harness does not own counts as no point.

### Frames and capabilities

`encodeHostFrame` in the wire library is the host's only encoder of host frames. It takes the
record's capabilities and the frame, and it throws, before it returns any bytes, when the frame or
one of its fields needs a capability the harness lacks: a `message` frame needs `live-messages`, an
`interrupt` frame needs `interrupt`, a `summarize` frame needs `summarize`, a turn frame's `resume`
key needs `resume`, and a non-null `limits.modelCalls` needs `turn-limit`. The step fails and sends
nothing. Each role's needs cover every capability its frames can use, including `images` for a role
whose input can carry an image, so a capability gap fails the config's load, and a throw marks a
host bug.

### Turn outcomes and the session position

Every guest ends a turn with an `ended` frame that carries an `outcome`, which its guest maps from
its runtime's own words:

| Outcome       | Meaning                                           |
| ------------- | ------------------------------------------------- |
| `finished`    | The model ended the turn                          |
| `stopped`     | Any other end, such as a refusal or an output cap |
| `limit`       | The guest stopped the turn at `limits.modelCalls` |
| `interrupted` | An `interrupt` frame stopped the turn             |
| `overflow`    | The context passed the model's window             |

The host reads `outcome` on the turn record that the running step built, and never reads the
harness's own `stopReason` or `terminalReason`, which it only writes. The `ended` frame carries a
session point exactly when the harness has a session, and a context size only when the harness
declares `context-window`. A guest that breaks this fails the step.

A step on a harness with no session finds the session position `unkept` at each step after its
first: the task has an opening, no summary and no session point its harness owns. nixie derives
`unkept` at each step and stores it nowhere. The step opens a session from the log with a rebuild
whose reason is null, sends a turn frame with no `resume` key, and stores no session point. A turn
that overflows fails its step, and the next step opens again from the log. A resumed turn that
overflows compacts only on a harness that declares `summarize`.

## Models outside Claude

An Agent SDK profile runs a model that is not a Claude model when it states `outside_claude: true`.
nixie never derives the mark from the model ID. The guest then removes the CLI's own system blocks
from each model request, so the model sees only nixie's system prompt
([the request rewriter](./conversation-turns.md#the-request-rewriter)). A profile outside Claude may
also state a `provider_pin`, and the rewriter then adds a provider order that keeps the prompt cache
on that one upstream provider.

The schema refuses 3 cases at the config's load:

| Case                                                                                  | Message                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| no `outside_claude`, and a model ID without `claude`                                  | `the model <model> names no Claude model, so the profile must state outside_claude: true or false`     |
| a `provider_pin` without `outside_claude: true`                                       | `a provider pin changes the request body, which nixie does only for a profile outside Claude`          |
| the checker role, or the conversation role when `checker` is unset, on such a profile | `the checker role runs on the profile <id>, which is outside Claude, and a check removes no CLI block` |

A profile that states `outside_claude: false` loads whatever its model ID, and its guest runs no
rewriter. The conversation role may run on a profile outside Claude when the checker role names
another profile. The context cap check above still applies: a model the CLI's catalog lacks gets the
smaller window.

nixie's code checks no model before a deployment lists it in `models.selectable`. OpenRouter
promises that its Messages endpoint works with the CLI only for the models of its Anthropic
provider. A model outside that set can break behaviours that nixie relies on, such as a turn past
the context window, a tool result past its tool-output limit and a mod's policy hooks. The
[SDK contract suite](../../runbooks/sdk-contract-suite.md#run-the-suite-on-another-model) checks
each of them on one model.

## The context cap

A profile's context cap sets the window nixie's compactor measures a session against
([compaction](./compaction.md)). The CLI, whose compaction the guest turns off, ignores the cap and
refuses a call only against the window it assumes for the model, so a cap larger than that window
would let a turn grow past the cap. The schema therefore refuses a profile whose cap is larger than
the window the CLI assumes for its model, and its error message gives the cap and the window. The
CLI first reduces a model ID to a catalog model, so a gateway or Bedrock spelling of a model gets
that model's window. It then assumes a window of a million tokens for an ID with the `[1m]` tag or a
model its bundled catalog marks as native to that window, and a smaller one for every other model.
The models module keeps a copy of both steps, read from the CLI that the pinned Agent SDK ships. A
model the copy misses gets the smaller window, so the check refuses such a profile rather than
passing it.

## The cache lifetime

A profile's cache lifetime is one of the two prompt cache lifetimes the CLI takes, the short one or
the long one, and it sets how long the cache entries that the conversation writes on the profile
last. The guest passes the lifetime to the CLI as its prompt cache setting, because the CLI
otherwise writes short entries on an API-key or bearer credential, and a turn that comes after a gap
longer than the short lifetime then writes its whole context to the cache again. A profile that sets
no lifetime gets the short one, and a deployment sets the long one on the conversation's profile
when enough of its gaps between bursts of turns fall inside it. A long entry costs more to write, so
the long lifetime pays off only past a share of such gaps, which the
[cache lifetime spike](../../../research/cache-lifetime/README.md) puts at about 42%.

The summary that compacts a conversation session runs on the profile's lifetime, because it reads
that session's cache. The checker passes no lifetime setting.

## Credentials

A profile holds a reference to its credential, never the credential. A reference reads
`deployment:<name>`, and the schema refuses a reference in any other form.

A model loop's guest never holds the credential either. The sandbox host holds it as a secret, and
adds it to each request to the profile's host, in the profile's auth header: a bearer header for a
gateway or an aggregator, and an API key header for Anthropic's own endpoint. The guest holds a
placeholder in the variable that the Agent SDK reads for that header
([sandboxes](../connectors/sandboxes.md)).

nixie names each secret by a SHA-256 digest of the profile's ID, the harness's secret header and the
model host ([names in impd](../deployment/impd-names.md#model-secrets)). The credential reaches the
sandbox host in one of 2 ways:

- **The deployment holds the credential.** nixie's decrypted secrets file has no entry `<name>`
  under `model_credentials`, and the deployment adds the secret to the sandbox host under nixie's
  name for it. To rotate the credential, the deployment replaces the secret's value under the same
  name, so every grant of the secret stays valid. When the sandbox host lacks the secret, nixie
  refuses to create the sandbox that needs it, and names the missing secret in the error.
- **nixie holds the credential.** The secrets file has the entry, and nixie adds the secret before
  it grants it. nixie adds a secret only when the sandbox host lacks its name, and never replaces a
  secret's value, so it puts the credential into the digest as well. To rotate the credential, the
  deployment changes the entry, and nixie adds a secret under the new name. A sandbox granted the
  old secret keeps working until nixie replaces the sandbox.

### Credentials with a spending gateway

A deployment whose config sets `spendStop` holds every model credential. The secrets file has no
`model_credentials` entry, so no nixie code can send a request with a key past the gateway. nixie
adds no model secret either. Each model secret already sits in the sandbox host with the gateway's
model listener as its upstream, the address where the sandbox host sends the request in place of the
model host ([the gateway](../policy/model-gateway.md#how-nixie-uses-the-gateway)).

The sandbox adapter reads each model secret's rules from the sandbox host before it creates a
sandbox, and refuses to create the sandbox when the sandbox host lacks the secret, a rule sends to
any other upstream, or a grant names no profile. The error names the secret. The adapter then grants
the secret with the path filter `/<sandbox name>/<profile ID>/**`, so a guest reaches only the count
of its own sandbox, on the one route of the profile that the secret belongs to. A guest that names
another profile's route meets a refusal from the credential broker before it adds the credential, so
one provider's credential never reaches another provider's route. The adapter applies the same check
to a sandbox that already exists: one whose grant lacks the filter, holds a wider one, or whose
secret sends elsewhere, counts as retired, so the caller replaces it. A sandbox recorded before a
grant held its route, or with a grant that names no route, counts as retired too. A deployment with
no `spendStop` grants and adds secrets as the section above says, with no filter.

## Records of model output

Every record that holds model output, such as a reply or a tool call, carries the model ID and the
profile's ID in its plain payload. nixie sets both from the profile in force for the call, and never
from anything the model or the guest sends, so a record names the model nixie chose even when the
model claims to be another. The fields sit in the plain payload, outside the erasable fields, so
they outlive a forgotten reply and a projection can read them.

## Prices and the provider pin

The schema reads each profile's prices, per million tokens of input, a cache write for each of the
two prompt cache lifetimes, cached input and output, and refuses a price table that leaves one out.
The call cost prices one response's usage with the table. It splits the cache writes by the lifetime
the response reports, and prices every write the response does not report under the shorter lifetime
at the longer lifetime's price, so a missing count never lowers a charge.

A price table can hold a second set of the same five prices for a long prompt, with the prompt
length that set starts above. A model such as Claude Haiku 5.5 charges more for every token of a
request whose prompt passes that length, output included, so the call cost prices the whole response
with the long-prompt set once its prompt passes the length. The prompt length counts the input, the
cache writes and the cache reads, the same tokens the provider counts. A table with no long-prompt
set prices every response with its base set.

The [model gateway](../policy/model-gateway.md#the-count) is the one built part that calls the call
cost. Only the guest's request rewriter reads the provider pin, and the gateway forwards a request
body as it came. The [models design](../../design/platform/core/models.md#cost) sets out how the
model gateway prices each response with the table.
