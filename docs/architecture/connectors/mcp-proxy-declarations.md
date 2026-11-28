# Effect declarations of proxied tools

A tool's declaration comes from the override file of its server in the definitions repo, and from
the annotations of its pinned form when the file has no entry for the tool. A tool's record of its
declaration holds which source applied (`annotations` or `override`), the pinned hash and, for an
override, the snapshot hash of the definitions that held it.

For pins, the registry and calls, read [the MCP proxy](mcp-proxy.md). For the repo that holds the
override files, read [the definitions format](../core/definitions.md#the-definitions-format). For
queued calls and the action runners, read [actions](../core/actions.md).

nixie maps the annotations to effects like this:

| Annotations                                                        | Effects                   |
| ------------------------------------------------------------------ | ------------------------- |
| `readOnlyHint: true`                                               | `read`                    |
| `readOnlyHint` false or missing, `destructiveHint: false`          | `write`, `send`           |
| `readOnlyHint` false or missing, `destructiveHint` true or missing | `write`, `delete`, `send` |

A missing hint takes the MCP standard's default, so a tool with no annotations declares the
strictest effects, and nixie asks the user to approve each call until an allow rule covers it. A
hint that is present and not a boolean leaves the tool with no declaration. By default, every string
argument at any depth counts as content: the items of an array or a tuple, each member of an
`anyOf`, `oneOf` or `allOf` union, the free keys of an object, a string enum, and the target of a
local `$ref` together with the keywords that sit beside the `$ref`. No argument is a destination or
an amount, and every result field is outside content, so its source is `untrusted`. A tool whose
effects are all reads runs direct, and a tool with any other effect is queued.

An annotation is the server's own claim, and nixie takes it as written. The starter rule
`allow-reads` runs a tool that declares only reads with no question, so a tool that claims
`readOnlyHint` runs unasked. For a server that the user does not trust to describe its tools, write
an override file for each of its tools, and leave out the rule that allows the server.

A rule that names `<server>.*` in its `tools` allows every tool of that server, the tools that the
server lists later too, so a write of any of them runs with no question. The deny, always-ask,
destination and scope checks run for such a call as for any other, and a rule with a condition still
needs the condition to hold.

## Override files

From definitions format 6, `mcp/<server>.yaml` holds the overrides of one server, named by the
server's ID. Each key is a tool's name on the server, before the prefix, and holds these fields:

| Field          | Holds                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------- |
| `effects`      | the tool's effects, at least one                                                             |
| `destinations` | the top-level arguments that name where the call sends something; none by default            |
| `amount`       | the top-level argument that holds a quantity of money or units; none by default              |
| `content`      | the arguments, at any depth, that carry the call's content; every string argument by default |
| `reconcile`    | `idempotencyKey: <argument>` or `check: <tool>`, never both; none by default                 |

nixie refuses the whole seed when a file does not parse, holds an unknown field or effect, or sits
in a subfolder, or when 2 files cover one server. The error lists each file with its fault.

An override fits only while the tool's pinned form and the server's listing hold every argument and
tool in it. Each destination, the amount and the idempotency key must be a top-level input property.
A property of a member of a root `anyOf`, `oneOf` or `allOf` counts as top-level, and so does a
property of a local `$ref` or one that sits beside the `$ref`. Each `content` entry must be an
argument path of the input schema, a `check` tool must be in the server's listing, and the
idempotency key must be no destination, amount or content entry, because the proxy fills it only
after the user approves. When a file has an entry for a tool that the server's listing lacks, that
tool is `stopped_unfit`, whether or not it had a pin. A tool whose override does not fit is
`stopped_unfit` with the fault as its reason, so no call runs under a declaration with an argument
or a tool that the tool lacks. nixie judges the fit at each listing, at each accept of a changed
form and at each seed that changes the overrides, and a tool whose override fits again is exposed
again with no new approval, because its pin never moved. The accept proposal's body shows which
declaration the tool would run under.

## Reconcile

An override's `reconcile` becomes the reconcile of the tool's connector, which `findConnector`
returns. With `idempotencyKey`, the connector fills that argument with the action's ID at each
attempt, so a retry of an interrupted call is the same call to the server. The action runners keep
the key for the time that `keyKeptForMs` in
[`build-action-connector.ts`](../../../modules/mcp/src/call/build-action-connector.ts) sets. The
input schema the model sees leaves the argument out, so a call needs no value for it, even when the
server's schema requires one. With `check`, the connector calls the named read tool with the call's
arguments after an interruption. A result with content counts as found. An empty result counts as
not found, and the action runs again. The check runs only when that tool is itself declared as a
read and is exposed, so a check changes nothing on the server and calls only a form the user
allowed.

A check that does not run, fails or ends in a server error is inconclusive, and the action comes to
the user. A result of images alone is inconclusive too, because nixie cannot read in the pictures
whether the read tool found the write. A tool with no `reconcile` has neither a key nor a check, and
an ambiguous action comes to the user.

A recovery runs only under the definitions snapshot that the action's first attempt ran under. A
later snapshot may set another key argument, a check in place of a key, or no reconcile. After a
snapshot change, a retry ends as ambiguous with nothing sent, and a check is inconclusive, so the
action comes to the user. A tool whose override left the definitions after its first attempt
declares no key, so it never sends a second attempt.
