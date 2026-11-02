---
name: project-ci-design
description:
  "nixie's test budget and required checks, and the one ci-design rule that nixie replaces: the
  Compose recipe check is required, yet a pull request skips it when it changes no file the recipe
  reads. Load it beside ci-design before you add or change a workflow, a job or a step in nixie."
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

- Keep the `recipe` job of [`compose.yml`](../../../.github/workflows/compose.yml) a required check
  that a pull request skips when it changes none of the job's paths. The Jobs section of
  [ci-design](../ci-design/SKILL.md) tells you to make a required check of your own always run,
  because GitHub counts a skipped required check as a pass. Here a skip is the right result: a pull
  request that changes none of those paths can't change whether the recipe starts.

## The Compose recipe

- Add a path to the `paths` of the `changes` job in `compose.yml` when the recipe in
  `deploy/compose/`, or the test build of nixie that the job starts in it, reads a new file. A
  missing path lets a pull request that breaks the recipe skip the check and merge.
- Expect every push to `main` to run the job, whatever changed, so `main` catches a missing path.
