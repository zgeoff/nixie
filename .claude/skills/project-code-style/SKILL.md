---
name: project-code-style
description:
  nixie's own additions to the shared code-style skill — the names that a library contract fixes,
  which the function-verb lint rule exempts, and how to fill a library's fetch key. Load it beside
  code-style before writing, reviewing, or renaming any TypeScript in this repo.
---

# Project code style

Load the shared `code-style` skill first. This skill holds only what nixie adds to it.
`check-project-verbs.sh` in the code-style skill fails when the lists here differ from the
`zgeoff/function-verb` options in [`.oxlintrc.json`](../../../.oxlintrc.json), so a change to one
changes both.

## Project verbs

nixie adds no verbs to the role table.

## Exempt names

A contract outside nixie fixes each of these names, so `zgeoff/function-verb` skips a function with
exactly that name. A name that only starts with one of them still follows the role table.

- `executeQuery`: the method that Kysely calls on a database connection, which the SQLite worker
  dialect implements.

A key that a library fixes but nixie only fills, such as the `fetch` handler of Bun's server or of
oRPC's link, takes a named function, as in `fetch: answerRequest`, and needs no exemption: the rule
reads the name of the function, and an inline function takes the key's name.
