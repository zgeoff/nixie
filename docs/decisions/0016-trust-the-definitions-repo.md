# 0016: A seed applies the definitions repo's widenings at once

- Date: 2026-11-19
- Status: decided

The definitions repo is the git repo that holds the user's [definitions](../glossary.md): the
persona, task definitions, skills, rules and budgets. A
[seed](../architecture/core/definitions.md#seeding) reads the repo and puts its definitions in
force. [The widening check](../architecture/policy/rules.md#the-widening-check) classifies each edit
to a rule: a widening lets more calls through or asks less often, and a narrowing does the reverse.
A [lift](../architecture/policy/budgets.md#lifts) lets one allow rule pass purchases that would
otherwise ask, up to a cost per purchase and a budget.

## Decision

A seed of the definitions repo applies every edit at once, a widening as much as a narrowing. That
covers a rule that widens, an effect that leaves a tool, a raised budget limit, a changed budget
period or count, and a lift. The seed writes no rule change proposal, the proposal that once held a
seed's widenings until the user approved them in the app. Each seed withdraws every rule change
proposal that is still pending.

A widening that starts inside nixie keeps its approval:

- Always allow on an approval card, the [card](../glossary.md) that shows one proposal in its
  thread;
- a [proposed rule](../architecture/policy/rules.md#proposed-rules);
- a [mandate](../architecture/policy/rules.md#mandates);
- a runtime rule change through `rules.*`.

## Why

- The user writes the repo and merges each change to it. The seed already trusts the repo for the
  models, the tasks and the persona, so a second yes in the app for the rules adds a step and no
  check that the merge lacks.
- A widening that starts inside nixie can come from the model, or from a prompt that untrusted
  content shaped. The approval guards that path, and the repo is not on it.

## Rejected alternatives

| Option                                                                                 | Why not                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hold each repo widening in one rule change proposal for the user to approve in the app | It asks twice for one change that the user already made. Until the second answer, the rule stays at the version that the last seed applied.                                                    |
| Hold only budget raises and lifts for approval, and apply every other widening at once | A budget or a lift in the repo is the user's choice as much as a rule is. The split would put one merge in force in 2 steps: its rules at the seed, and its budgets and lifts at the approval. |

## Consequences

- A budget raise or a lift rule from the repo skips the
  [passkey check](../architecture/policy/passkeys.md#which-answers-take-the-passkey), because no
  proposal exists for a passkey to answer. Made inside nixie, a budget raise is a proposal of the
  `always_ask` risk class and a lift is one of the `lifting` risk class, and each still takes the
  passkey.
- A widening from the repo that the user rejected in a rule change proposal goes in force at the
  next seed while the repo still holds it. To keep it out, remove it from the repo.
- A nixie release can drop an effect from a tool's declaration, and the next seed applies the drop
  with no ask.
