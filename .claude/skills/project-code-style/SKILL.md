---
name: project-code-style
description:
  "The one code-style rule nixie replaces: a method that a library calls by name, such as Kysely's
  executeQuery, keeps that name even when it starts with a banned verb. Also how to exempt such a
  name, and how to pass a handler such as a fetch handler without a lint failure. Load it beside
  code-style before you write, review or rename TypeScript in nixie."
metadata:
  kind: rule-set
---

# nixie code style

## Departures

- Keep the name of a method that a library calls by that name, such as `executeQuery`, which Kysely
  calls on a database connection. [code-style](../code-style/SKILL.md) bans names that start with
  `execute`, but a renamed method never gets called.
  [`executeQuery`](../../../libs/db/src/build-sqlite-worker-dialect.ts) in the SQLite worker dialect
  keeps its name for this reason.

## The function-verb lint rule

- When the `zgeoff/function-verb` lint rule rejects the name of a method that a library calls, add
  that exact name to the rule's `exemptNames` option in [`.oxlintrc.json`](../../../.oxlintrc.json),
  in the commit that adds the method. The option matches exact names, so your own helper
  `executeQueryBatch` still fails. Name a helper with a verb that code-style allows.
- Give a library a handler as a named function, such as `fetch: answerRequest` with
  `function answerRequest`. This covers a key that the library names, such as `fetch` on Bun's
  server or on oRPC's `RPCLink`. An arrow function or a method shorthand under the key takes the
  key's name, and the rule fails it when the key starts with a banned verb. Never add `fetch` to
  `exemptNames`: the option would then skip every function named `fetch`.
