---
name: project-code-style
description:
  "nixie's code-style rules beside the shared ones: how to keep the name of a method that a library
  calls by name, such as Kysely's executeQuery, even when it starts with a banned verb; how to
  exempt such a name; how to pass a handler such as a fetch handler without a lint failure; and how
  to write the description the assistant reads for a tool. Load it beside code-style before you
  write, review or rename TypeScript in nixie, including a tool's description."
metadata:
  kind: rule-set
---

# nixie code style

## Departures

- Keep the name of a method that a library calls by that name, such as `executeQuery`, which Kysely
  calls on a database connection. [Function names](../code-style/SKILL.md#function-names) in
  code-style bans names that start with `execute`, but a renamed method never gets called.
  [`executeQuery`](../../../libs/db/src/sqlite/build-sqlite-worker-dialect.ts) in the SQLite worker
  dialect keeps its name for this reason. Exempt each kept name from the `zgeoff/function-verb` lint
  rule, as [The function-verb lint rule](#the-function-verb-lint-rule) says.

## The function-verb lint rule

- When the `zgeoff/function-verb` lint rule rejects the name of a method that a library calls, add
  that exact name to the `exemptNames` array under `zgeoff/function-verb` in
  [`.oxlintrc.json`](../../../.oxlintrc.json), in the commit that adds the method. The array matches
  exact names, so your own helper `executeQueryBatch` still fails. Name a helper with a verb that
  code-style allows.
- When a library takes a handler under a key it names, such as `fetch` on Bun's server or on oRPC's
  `RPCLink`, declare the handler as a named function and pass it by name: `fetch: answerRequest`,
  where `function answerRequest` is declared in the same file. The lint rule takes the name of an
  arrow function or a method shorthand from its key. So `fetch: (request) => ...` counts as a
  function named `fetch`, and fails, because code-style bans `fetch` as a leading verb. Never add
  `fetch` to `exemptNames`: the rule would then skip every function named `fetch`.

## Tool descriptions

The assistant, the model nixie runs, reads each tool's description on every turn and treats each
line as something to act on or to worry about. Write it for her.

- Say what the tool is for and when to reach for it, in a sentence or two.
- Treat what she sends through a tool as her own words and her own action. Never describe it as
  typed by the user or sent as someone else. A coding session she started or joined is hers to
  steer.
- Leave out how the tool works, such as how text reaches a session, and the cases where it is
  refused. She learns from the tool's result when a call fails, and why.
- Never list everything she can do with the tool, or with nixie. She picks only from a list she
  sees, and stops trying anything the list leaves out.
- Name the tool for its intent, as `coding.steer` does, so the description needs no warning about
  misuse.
