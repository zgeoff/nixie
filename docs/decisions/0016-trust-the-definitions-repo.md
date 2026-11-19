# 0016: A seed applies the definitions repo's widenings at once

- Date: 2026-11-19
- Status: decided

## Decision

A seed of the definitions repo applies every edit at once, a widening as much as a narrowing. That
covers a rule that widens, an effect that leaves a tool, a raised budget limit, a changed budget
period or count, and a lift. The seed writes no rule change proposal, and withdraws each one that
still waits.

A widening that starts inside nixie keeps its approval: Always allow on an approval card, a proposed
rule, a mandate, and a runtime rule change through `rules.*`.

## Why

- The user writes the repo and merges each change to it. The seed already trusts the repo for the
  models, the tasks and the persona, so a second yes in the app for the rules adds a step and no
  check the merge lacks.
- A widening that starts inside nixie can come from the model or from a prompt that untrusted
  content shaped. The approval guards that path, and the repo is not on it.

## Rejected alternatives

| Option                                                                     | Why not                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| hold each repo widening in one rule change proposal for the app to approve | It asks twice for one change the user already made, and the seeded version stays in force until the second answer.        |
| hold only budget raises and lifts, and apply the rest                      | A budget or a lift in the repo is the user's choice as much as a rule is, and the split leaves 2 ways to change one file. |

## Consequences

- A budget raise or a lift rule from the repo skips the passkey check of the `lifting` risk class,
  because no proposal exists for the passkey to answer. The same change made inside nixie still
  takes the passkey.
- A widening rejected in the app goes in force at the next seed while the repo still holds it. To
  keep it out, remove it from the repo.
- A nixie release can drop an effect from a tool's declaration, and the next seed applies the drop
  with no ask.
