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
  calls on a database connection. The [Banned verbs](../code-style/SKILL.md#banned-verbs) rule bans
  `execute`, but the library decides the name.
  [`build-sqlite-worker-dialect.ts`](../../../libs/db/src/build-sqlite-worker-dialect.ts) defines
  nixie's `executeQuery`.

## The function-verb lint rule

- Add each such name to the `exemptNames` option of the `zgeoff/function-verb` lint rule in
  [`.oxlintrc.json`](../../../.oxlintrc.json), in the commit that adds the method. The rule exempts
  the whole name only, so `executeQueryBatch` still needs a verb from the role table.
- Pass a handler that a library calls under a key it names, such as the `fetch` key of Bun's server
  or of oRPC's link, as a named function: `fetch: answerRequest`. The lint rule reads the function's
  own name, so this needs no exemption. An inline function takes the key's name, and the rule fails
  that name on a banned verb such as `fetch`.
