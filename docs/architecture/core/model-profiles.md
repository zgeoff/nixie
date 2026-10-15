# Model profiles

nixie reaches every model through a model profile: a named route to one model on one
Anthropic-compatible endpoint, with a reference to its credential, the header that credential goes
in, the model ID, the reasoning effort, an optional context cap, an optional provider pin and an
optional price table. Each model role names the profile it uses, so moving a role to another model
is a change to the deployment configuration and never to code.
[Conversation turns](./conversation-turns.md) covers how the conversation runs its turns on its
role's profile, and decision [0033](../../decisions/0033-model-profiles.md) records why profiles
exist.

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

## The context cap

A profile's context cap sets the window the Claude CLI compacts within
([compaction](./conversation-turns.md#compaction)). With auto-compaction off, the CLI ignores the
cap and refuses a call only against the window it assumes for the model, so a cap larger than that
window would let a turn grow past the cap. The schema therefore refuses a profile whose cap is
larger than the window the CLI assumes for its model, and its error message gives the cap and the
window. The CLI first reduces a model ID to a catalog model, so a gateway or Bedrock spelling of a
model gets that model's window. It then assumes a window of a million tokens for an ID with the
`[1m]` tag or a model its bundled catalog marks as native to that window, and a smaller one for
every other model. The models module keeps a copy of both steps, read from the CLI that the pinned
Agent SDK ships. A model the copy misses gets the smaller window, so the check refuses such a
profile rather than passing it.

## Credentials

A profile holds a reference to its credential, never the credential. A reference reads
`deployment:<name>` and names the entry `<name>` under `model_credentials` in nixie's decrypted
secrets file, and the schema refuses a reference to any other backend. At start, nixie resolves the
credential of every profile and refuses to start when the secrets file lacks one, so a missing
credential never shows up as a failed turn.

A model loop's guest never holds the credential. nixie stores it with the sandbox adapter's
injecting backend, which sends it to the profile's host alone, in the profile's auth header: a
bearer header for a gateway or an aggregator, and an API key header for Anthropic's own endpoint.
The sandbox's one grant names that secret, and the guest holds a placeholder in the variable the
Agent SDK reads for that header ([sandboxes](../connectors/sandboxes.md)).

The secret's name holds the profile's ID and a digest of the credential, its host and its header. A
rotated credential therefore gets a new secret beside the old one, and a sandbox granted the old one
keeps working until nixie replaces it.

## Records of model output

Every record that holds model output, such as a reply or a tool call, carries the model ID and the
profile's ID in its plain payload. nixie sets both from the profile in force for the call, and never
from anything the model or the guest sends, so a record names the model nixie chose even when the
model claims to be another. The fields sit in the plain payload, outside the erasable fields, so
they outlive a forgotten reply and a projection can read them.

## Prices and the provider pin

The schema reads each profile's prices, per million tokens of input, cache write, cached input and
output, and its provider pin, and no built part reads either. The
[models design](../../design/platform/core/models.md#cost) sets out how the counting proxy prices
each response with the table.
