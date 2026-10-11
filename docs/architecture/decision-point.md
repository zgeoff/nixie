# The decision point

`modules/policy` holds the decision point, which every tool call passes before it acts. It takes a
tool's name and the caller's tool list, and returns allow or deny with the stage and the rule that
decided. The first build runs the registry and scope stages, then one fixed rule written in code in
place of the deny, ask and allow stages, so the decision point never asks. The
[design](../design/platform/policy/decision-point.md) covers the full pipeline.

## The stages

The stages run in order, and the first that decides returns:

| Stage       | Decides                                                      | Outcome       |
| ----------- | ------------------------------------------------------------ | ------------- |
| 1. Registry | The registry holds no declaration for the tool, or no effect | Deny          |
| 2. Scope    | The tool is missing from the caller's tool list              | Deny          |
| 3. Fixed    | The fixed read-only rule                                     | Allow or deny |

The read-only rule allows a call whose effects are only reads, fetches or notes, and denies every
other call, so stage 3 decides every call that reaches it. **Why:** proposals arrive with approvals,
so a call that would ask has nowhere to wait.

A deny carries a sentence, which the model receives as the tool result. A rule's deny gives the
rule's ID and sentence, and a registry or scope deny gives a sentence with the tool's name. The
decision holds the stage, and the deciding rule's ID and revision. The record of the call holds the
decision beside the snapshot hash of the definitions in force, as
[the tool endpoint](tools.md#records) describes.

## Effects and declarations

Every tool declares its effects, the arguments that hold a destination, an amount or free text, and
the source of content of each field of its result. A tool's effects never depend on its arguments,
so a rule reads the same for every call of a tool.

## The test rule

A test build adds one rule before the read-only rule: it allows the crash tests' send tool and
covers no other call. The bundler drops the test rule from the release bundle. **Why:** a release
then holds only the read-only rule, and no test can widen it.
