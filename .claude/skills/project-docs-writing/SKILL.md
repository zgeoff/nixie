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

- Link the Linear issue for planned work or an open choice from the doc that meets it, and keep the
  question itself in the issue, in the nixie project. The
  [Describe the system as it is now](../docs-writing/SKILL.md#describe-the-system-as-it-is-now) rule
  leaves tracker links out of docs. nixie is in its first build, so its designs describe work not
  yet built, and the link keeps one copy of each open question.

## Spikes

- Put each spike in `research/<name>/`, and list it in the
  [spikes index](../../../research/README.md).
- Delete a spike once the architecture doc that owns its finding states that finding. Link a doc
  that cited the spike to the commit before the one that deleted the spike, so the link still opens.

## The person nixie works for

- Address that person as "you", and call them "the user" in an architecture doc, as the opening of
  the [glossary](../../../docs/glossary.md) says.
- Write "you" only where that person acts: "memory shows in 2 ways", not "you see memory in 2 ways".
- Never call that person "the owner" in a doc. In the glossary, `owner` is a value of a memory
  item's subject.

## Runs

- Never write "run" as a bare noun. Name which run it is from the
  [glossary](../../../docs/glossary.md), such as a job run or a task run. "Run" as a verb needs no
  noun.
