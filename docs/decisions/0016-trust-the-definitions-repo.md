# 0016: A seed applies the definitions repo's widenings at once

- Date: 2026-11-19
- Status: decided

## Decision

A seed of the definitions repo applies every edit at once, a widening as much as a narrowing. The
[terms](#terms) section defines each of these words. The edits that widen are:

- a rule that widens;
- an effect that leaves a tool;
- a higher budget limit, or a change to a budget's period or to what it counts;
- a new lift, or a lift that rises.

A seed never writes a rule change proposal, and it withdraws each pending rule change proposal that
the log holds. A seed leaves every other kind of proposal pending, such as a proposed rule or a
mandate.

A widening that starts inside nixie still asks for the user's approval:

- Always allow, the answer on an approval card that adds a rule;
- a [proposed rule](../architecture/policy/rules.md#proposed-rules);
- a [mandate](../architecture/policy/rules.md#mandates).

The device calls `rules.removeRule` and `rules.editRule` refuse a widening, as
[narrowing a rule from the client](../architecture/policy/rules.md#narrowing-a-rule-from-the-client)
describes.

## Terms

- **Definitions repo:** the git repo that holds the user's [definitions](../glossary.md): the
  persona, the task definitions, the skills, the rules, the tool effects and the budgets.
- **Seed:** the step that reads the definitions and puts them in force, as
  [seeding](../architecture/core/definitions.md#seeding) describes.
- **Widening and narrowing:**
  [the widening check](../architecture/policy/rules.md#the-widening-check) classifies each edit. A
  widening lets a call through with fewer asks, and a narrowing asks more or denies more.
- **Effect:** what a tool declares it does, such as `send` or `spend`. Rules match a tool by its
  effects, so an effect that leaves a tool takes the tool out of the rules that match that effect,
  as [effects and declarations](../architecture/policy/decision-point.md#effects-and-declarations)
  describes.
- **Lift:** the field of an allow rule that lets nixie make purchases without an ask, each up to a
  cost per purchase and all within one budget, as [lifts](../architecture/policy/budgets.md#lifts)
  describes.
- **Rule change proposal:** a proposal that holds a seed's widenings until the user answers it. The
  [commands](../architecture/policy/rules.md#commands-and-the-proposals-screen) still answer the
  ones that the log holds.

## Why

- The user writes the repo and merges each change to it. A seed already applies the persona, the
  skills and the task definitions from the repo with no ask. A second yes in the app for the rules
  adds a step, and it checks nothing that the merge did not check.
- A widening that starts inside nixie can come from the model, or from a prompt that untrusted
  content shaped. The user's approval guards that path. A change to the repo never takes that path.

## Rejected alternatives

| Option                                                                                 | Why not                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Hold each repo widening in one rule change proposal for the user to approve in the app | It asks twice for one change that the user already made. Until the second answer, the rule stays at the version that the last seed applied. |
| Hold only budget raises and lifts for approval, and apply every other widening at once | A budget or a lift in the repo is the user's choice as much as a rule is. The split would put one merge in force in 2 steps.                |

## Consequences

- A budget raise or a lift from the repo goes in force with no
  [passkey check](../architecture/policy/passkeys.md#which-answers-take-the-passkey), because the
  seed writes no proposal for the user to answer. Inside nixie, the user still answers each of these
  with the passkey: a budget raise in the `always_ask` risk class and a lift in the `lifting` risk
  class.
- The app can never keep out a widening that the repo holds. To keep a widening out, remove it from
  the repo.
- A nixie release can drop an effect from a tool's declaration. The next seed applies the drop with
  no ask, as it applies an effect that leaves a tool through the repo.
