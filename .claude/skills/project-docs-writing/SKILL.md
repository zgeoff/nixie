---
name: project-docs-writing
description:
  "The one docs-writing rule nixie replaces: a doc links the Linear issue for planned work or an
  open choice. Also where nixie's spikes live and when to delete one, and how its docs name the
  person a deployment works for. Load it beside docs-writing before you write, edit or review prose
  in nixie."
metadata:
  kind: rule-set
---

# nixie docs writing

## Departures

- When a doc mentions planned work or an open question, link its Linear issue in the nixie project,
  and keep the question in the issue. The
  [Describe the system as it is now](../docs-writing/SKILL.md#describe-the-system-as-it-is-now) rule
  leaves tracker links out of docs. nixie's designs describe work not yet built, so link the issue
  to keep one copy of each open question.

## Spikes

- Put each spike in `research/<name>/`, and list it in the
  [spikes index](../../../research/README.md).
- Delete a spike once the architecture doc that owns its finding states that finding. In each doc
  that links to the spike, point the link at the commit before the deletion, so it still opens.

## The person nixie works for

- Address the person nixie works for as "you". In an architecture doc, call them "the user" instead,
  as the opening of the [glossary](../../../docs/glossary.md) says.
- Write "you" only for an action that person takes: "memory shows in 2 ways", not "you see memory in
  2 ways".
- Never call that person "the owner". In the glossary, `owner` is a value of a memory item's
  subject.

## The owner of a design

- In `docs/design/`, write "the owner" for the person who approves each design and settles its open
  questions, as in the design-docs skill. That is a role in the project, apart from the person a
  deployment works for.

## Runs

- Never write "run" as a bare noun. Name which run it is from the
  [glossary](../../../docs/glossary.md), such as a job run or a task run. A bare "run" could mean
  either, or a CI run. "Run" as a verb needs no noun.
