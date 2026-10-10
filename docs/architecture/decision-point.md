# The decision point

`modules/policy` holds the decision point, the one function every tool call passes before it acts.
`makeDecisionPoint` returns it, and it takes a tool's name with the caller's tool list and returns
allow or deny, with the stage and rule that decided. The first build runs the registry and scope
stages, then one fixed rule written in code in place of the deny, ask and allow stages, so the
decision point never asks. The [design](../design/platform/policy/decision-point.md) covers the full
pipeline.

## The stages

The stages run in order, and the first that decides returns:

| Stage       | Decides                                                      | Outcome       | Rule                                  |
| ----------- | ------------------------------------------------------------ | ------------- | ------------------------------------- |
| 1. Registry | The registry holds no declaration for the tool, or no effect | Deny          | None                                  |
| 2. Scope    | The tool is missing from the caller's tool list              | Deny          | None                                  |
| 3. Fixed    | A fixed rule covers the call                                 | Allow or deny | `slice1.read-only`, `test.allow-send` |

`slice1.read-only` allows a call whose effects are only `read`, `fetch` or `note`, and denies every
other call, so stage 3 decides every call that reaches it. **Why:** proposals arrive with approvals,
so a call that would ask has nowhere to wait.

A deny carries a sentence, which the model receives as the tool result: the rule's ID and sentence
for a fixed rule, and a sentence with the tool's name for stages 1 and 2.

The decision is the log's `Decision` type, with the stage number and the deciding rule's ID and
revision. The record of the call holds it, beside the snapshot hash of the definitions in force, as
[the tool endpoint](tools.md#records) describes.

## Effects and declarations

Every tool declares its effects in an `EffectDeclaration`, with the arguments that hold a
destination, an amount or free text, and the source of content of each field of its result.
[`types.ts`](../../modules/policy/src/types.ts) holds the effect list and the declaration. A tool's
effects never depend on its arguments, so a rule reads the same for every call of a tool.

## The test rule

`test.allow-send` allows `test.send`, the crash tests' send tool, and covers no other call. It sits
before `slice1.read-only` behind `NIXIE_TEST_BUILD`. The release bundle defines the constant as
`false`, so the bundler drops the rule and its module. **Why:** a release build then holds only
`slice1.read-only`, and no test can widen it. A test in `make-decision-point.test.ts` builds the
release bundle, checks that it holds no `test.allow-send`, and runs it to deny `test.send`.
