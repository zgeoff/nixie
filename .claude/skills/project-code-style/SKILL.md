---
name: project-code-style
description:
  nixie's own additions to the shared code-style skill — the names that a library or wire contract
  fixes, which the function-verb lint rule exempts. Load it beside code-style before writing,
  reviewing, or renaming any TypeScript in this repo.
---

# Project code style

Load the shared `code-style` skill first. This skill holds only what nixie adds to it.
`check-project-verbs.sh` in the code-style skill fails when the lists here differ from the
`zgeoff/function-verb` options in [`.oxlintrc.json`](../../../.oxlintrc.json), so a change to one
changes both.

## Project verbs

nixie adds no verbs to the role table.

## Exempt names

A contract outside the function fixes each of these names, so `zgeoff/function-verb` skips a
function with exactly that name. A name that only starts with one of them, such as `fetchPage`,
still follows the role table.

- `executeQuery`: the method that Kysely calls on a database connection, which the SQLite worker
  dialect implements.
- `fetch`: the request handler that Bun's server and oRPC's link call.
- `process`: the health report's part for the server process, which a deployment's probes read.
