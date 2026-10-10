---
name: project-docs-writing
description:
  nixie's own rules for repo prose, on top of the shared docs-writing skill. Use with docs-writing
  whenever you write, edit, or review prose in this repo.
---

# Project docs writing

Load the shared `docs-writing` skill first. Where the two skills disagree, this one wins.

## The design baseline

`docs/decisions/` and `docs/design/` hold the locked design baseline, and the Selection rules of
`docs-writing` apply to them in full. Each decision record states the decision as it stands, with
every later change folded in, and git keeps the history. A record keeps its date in the header and
the alternatives it rejected, because the rejected options explain the decision.

A design doc states contracts: what each part does, its interfaces, its guarantees, and the reason
for each one. Evidence lives in the spike that produced it, and the design links the spike instead
of repeating its numbers or its method. Each design marks what the first build implements and what
extends it later.

Open questions live only in [open items](../../../docs/design/open-items.md), each with its options
and a recommendation. A decision record or a design doc links the open item instead of restating the
question.

## Voice

The docs address the reader as "you", the one person a nixie deployment works for. A sentence drops
the actor where the actor adds nothing: "memory shows in 2 ways", not "you see memory in 2 ways".
The docs never write "the owner".

Terms follow the [glossary](../../../docs/glossary.md), one meaning each. "Run" always takes its
noun: job run, task run, worker run or code run.
