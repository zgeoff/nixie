# Model profiles

nixie reaches every model through a model profile: a named route to one model on one
Anthropic-compatible endpoint, with the harness that runs its turns, a reference to its credential,
the header that credential goes in, the model ID, the reasoning effort, an optional context cap, a
prompt cache lifetime, an optional provider pin and an optional price table. Each model role names
the profile it uses, so moving a role to another model is a change to the deployment configuration
and never to code. [Conversation turns](./conversation-turns.md) covers how the conversation runs
its turns on its role's profile.

## The role map

The deployment configuration holds the profiles, each under its ID, and the role map: the
conversation, other tasks, workers, the checker and the memory writer. The models module owns the
schema of that section, and the server composes it into the root schema of the whole file, which
refuses a key no module reads, so a typo never passes as a default.

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
refuses a profile with no `harness` key, and its error names the profile and the fix,
`harness: agent-sdk`.

The models module holds one record for each harness that nixie runs. Host code reads the record for
everything that differs between harnesses, and never branches on a harness ID:

- the profile's config schema;
- the model grant, and the placeholder credential the guest holds;
- the guest and the entry file for each of its loops, and the key of its image in the sandbox
  manifest;
- the model API the harness speaks;
- the MCP `_meta` key that carries the model's tool-use ID on each tool call;
- the session files that a replaced sandbox carries, or none when the harness keeps no session that
  a new sandbox can resume.

Only the `agent-sdk` harness has a record, so the schema refuses a profile on any other harness.

The wire library holds every harness ID and the features each harness declares, such as resuming a
session at an entry or returning structured output. Each role declares the features its loop needs,
and nixie checks a profile's harness against those needs in 2 places:

| Where             | What it checks                                                                                                     | On a misfit                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| The config's load | each role's profile, an unset role on the conversation's profile, and each selectable model against a task's needs | the schema refuses the file, naming the role or the selectable model, the profile and each missing feature |
| A task's start    | the chosen selectable model against a task's needs                                                                 | the start writes nothing, and tells the model each missing feature                                         |

The turn profile that the host sends a guest, and each session point, name their harness too. nixie
reads a stored session point that names no harness as an Agent SDK point.

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
that session's cache. The memory writer and the memory consolidator start a fresh session for each
run, so their sessions write short entries on any profile. The checker passes no lifetime setting.

## Credentials

A profile holds a reference to its credential, never the credential. A reference reads
`deployment:<name>`, and the schema refuses a reference in any other form.

A model loop's guest never holds the credential either. The sandbox host holds it as a secret, and
adds it to each request to the profile's host, in the profile's auth header: a bearer header for a
gateway or an aggregator, and an API key header for Anthropic's own endpoint. The guest holds a
placeholder in the variable that the Agent SDK reads for that header
([sandboxes](../connectors/sandboxes.md)).

nixie names each secret by a SHA-256 digest of the profile's ID, the auth header and the model host
([names in impd](../deployment/impd-names.md#model-secrets)). The credential reaches the sandbox
host in one of 2 ways:

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

The [counting proxy](../policy/counting-proxy.md#the-count) is the one built part that calls the
call cost, and no built part reads the provider pin. The
[models design](../../design/platform/core/models.md#cost) sets out how the counting proxy prices
each response with the table.
