# The decision point

Every tool call passes the decision point before it acts, and the decision point answers allow or
deny from what the tool declares it does. It never reads the call's arguments to decide, so the same
tool gets the same answer on every call under the same rules. The decision it returns names the
stage and the rule that decided, and the record of the call keeps that decision beside the snapshot
hash of the definitions in force, so a replay can show why a call ran or was refused.
`modules/policy` owns the decision point and the effect declarations.
[Tool calls](../connectors/tool-calls.md) covers how a call reaches it, and the
[decision point design](../../design/platform/policy/decision-point.md) covers the full pipeline, of
which the first stages are built.

## The stages

The stages run in order, and the first that decides returns:

| Stage       | Decides when                                                 | Outcome       |
| ----------- | ------------------------------------------------------------ | ------------- |
| 1. Registry | The registry holds no declaration for the tool, or no effect | Deny          |
| 2. Scope    | The tool is missing from the caller's tool list              | Deny          |
| 3. Fixed    | Always: the fixed read-only rule decides every call it sees  | Allow or deny |

The caller's tool list is the run's own: the job's list for a job run, and the subset its caller
passed for a worker. A tool that the registry knows but the run was not given is therefore denied,
even though the model can name it.

One fixed rule written in code stands in for the deny, ask and allow stages of the full pipeline. It
allows a call whose effects are only reads, fetches or notes, and denies every other call. The
decision point therefore never asks the user anything: a call that would ask has nowhere to wait,
and the [approvals design](../../design/platform/policy/approvals.md) covers that wait. A tool that
sends, writes or spends is denied, whatever its arguments.

A deny carries a sentence, which the model receives as the tool's result. A rule's deny gives the
rule's ID and sentence. A registry or scope deny gives a sentence with the tool's name, which the
model chose, so the tool endpoint counts that sentence as untrusted content. The decision itself
holds the stage, and the deciding rule's ID and revision.

## Effects and declarations

Every tool declares its effects, such as read, fetch, write, send or spend, and the declaration
lives in nixie's registry, not in the tool's description. A tool's effects never depend on its
arguments, so a rule reads the same for every call of a tool. The declaration also names the
arguments that hold a destination, an amount or free text, and the source of content of each field
of the tool's result, which the [tool endpoint](../connectors/tool-calls.md#records) records with
every result.

The declarations in force are part of the policy that the snapshot hash covers
([the definitions](../core/definitions.md#the-snapshot-hash)), because the fixed rule decides by
them, and a replay must read the declarations that decided.

## The test rule

A test build adds one rule before the read-only rule. It allows the crash tests' send tool and
covers no other call. The bundler drops the test rule from the release bundle, so a release holds
only the read-only rule and no test can widen it.
