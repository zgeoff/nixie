---
name: project-ci-design
description:
  "nixie's test budget and required checks, and how to keep the required Compose recipe check true
  to the files it reads. Load it beside ci-design before you add or change a workflow, a job or a
  step in nixie."
metadata:
  kind: rule-set
---

# nixie CI design

## Facts

| Fact            | Where                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Test budget     | 3 min                                                                              |
| Required checks | `gh api repos/zgeoff/nixie/rules/branches/main`, the `required_status_checks` rule |

## Departures

None.

## The Compose recipe

- Add a path to the `paths` of the `changes` job in
  [`compose.yml`](../../../.github/workflows/compose.yml) when the recipe in `deploy/compose/`, or
  the test build of nixie that the job starts in it, reads a new file. The required `recipe` job
  always runs, but it skips each of its steps when no listed path changed, so a missing path lets a
  pull request that breaks the recipe pass the check and merge.
- Gate each new step of the `recipe` job on `env.RECIPE_CHANGED == 'true'`, as the others are.
