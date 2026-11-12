# 0004: nixie writes its own rule format and evaluator

- Date: 2026-10-07
- Status: decided

## Decision

nixie writes its own rule format and evaluator, in TypeScript, with no policy engine underneath. A
rule is plain data: it matches a tool, an effect and a context, and gives one outcome: allow, ask or
deny. Every decision records the ID of the rule that made it.

## Why

- A rule in a fixed format renders as a sentence and edits through a form, so you can read and
  change every rule.
- With a small fixed set of checks, nixie can compare 2 rules and tell whether an edit widens
  access. That check lets a rule that only narrows access apply without asking.
- Rule IDs, the precedence of allow, ask and deny, and the decision record follow nixie's own
  design, with no adapter between an engine's model and nixie's.
- The evaluator is small, has no dependency, and is built from primitives that nixie owns.
- Speed does not separate the options: a check runs once per tool call, and a model turn takes
  seconds.

## Rejected alternatives

| Option                  | Why not                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cedar                   | It names the deciding rule, lets a forbid rule override an allow, and validates an edit against a schema. It ships as Rust compiled to WASM, which nixie cannot read or patch in TypeScript, and its widening check lives in Lean-based tooling that no test has run inside Bun. |
| OPA                     | It needs its Go binary at build time to compile Rego to WASM, its JS SDK last shipped in 2024, and a decision carries no rule ID unless each rule reports one.                                                                                                                   |
| CEL as the whole engine | `@marcbachmann/cel-js` runs in pure JS. It evaluates expressions only, so nixie would still build rule IDs and precedence around it, and arbitrary expressions defeat the widening check.                                                                                        |

## Consequences

- nixie owns the rule format, its validation, the editing UI and the widening check.
