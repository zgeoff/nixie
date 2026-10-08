# 0004: The rule engine

- Date: 2026-10-07
- Status: decided
- Research: [policy model notes](../research/2.3-notes/policy-models.md),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#policy-layers)

nixie writes its own rule format and evaluator, in TypeScript, with no policy engine underneath. A
rule is plain data: it matches a tool, an effect and a context, applies a small fixed set of checks
to the tool's arguments, and gives one outcome: allow, ask or deny. The checks are equality,
membership in a list, and a pattern match. Every decision records the ID of the rule that made it.
When no rule matches, the outcome is ask.

## Why

- A rule in a fixed format renders as a sentence and edits through a form, so the owner can read and
  change every rule.
- With fixed checks, nixie can compare 2 rules and tell whether an edit widens access. That check
  lets nixie apply a suggested rule that only narrows access without asking the owner.
- Rule IDs, the precedence of allow, ask and deny, and the decision record follow nixie's own
  design, with no adapter between an engine's model and nixie's.
- The evaluator is small, has no dependency, and is built from primitives that nixie owns.
- Speed does not separate the options: a check runs once per tool call, and a model turn takes
  seconds.

## Alternatives

- **Cedar.** It names the deciding rule, lets a forbid rule override an allow, and validates an edit
  against a schema. It ships as Rust compiled to WASM in `@cedar-policy/cedar-wasm` 4.13.0
  ([cedar-wasm on npm](https://registry.npmjs.org/@cedar-policy/cedar-wasm/latest), 2026-10-07),
  which nixie cannot read or patch in TypeScript. Its widening check lives in Cedar's Lean-based
  analysis tooling, which no test has run inside Bun.
- **OPA.** It needs its Go binary at build time to compile Rego to WASM
  ([OPA docs: Wasm](https://www.openpolicyagent.org/docs/wasm), 2026-10-07). Its JS SDK last shipped
  as 1.10.0 on 2024-11-08
  ([opa-wasm on npm](https://registry.npmjs.org/@open-policy-agent/opa-wasm/latest), 2026-10-07). A
  decision carries no rule ID unless each rule reports one.
- **CEL as the whole engine.** `@marcbachmann/cel-js` 8.0.0 runs in pure JS
  ([cel-js README](https://raw.githubusercontent.com/marcbachmann/cel-js/main/README.md),
  2026-10-07). It evaluates expressions only, so nixie would still build rule IDs and precedence
  around it, and arbitrary expressions defeat the widening check.

## Consequences

- nixie owns the rule format, its validation, the editing UI and the widening check.
- When a real rule cannot be written with the fixed checks, its condition may use a CEL expression
  instead of a new operator. nixie cannot analyse such a rule, so widening it always asks the owner.
- How restrictive nixie feels depends on the starter rule set and the "no match means ask" default,
  which Phase 3 designs.
