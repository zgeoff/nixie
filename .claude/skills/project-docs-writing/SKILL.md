---
name: project-docs-writing
description:
  nixie's own rules for repo prose, on top of the shared docs-writing skill — decision records
  edited in place, spikes under research/, the Linear project, the architecture areas, and the
  voice. Use with docs-writing whenever you write, edit, or review prose in this repo.
---

# Project docs writing

Load the shared `docs-writing` skill first. This skill holds only what nixie adds to it, and where
the two disagree, this one wins.

## Decision records

A changed decision is edited in place, not superseded by a new record. The record keeps its number
and states the decision as it now stands, its header gains an `Updated` date, and a `## Changes`
list at its end gives each change's date and a one-line summary. The `## Changes` list is the one
place a record holds history.

## Spikes and open work

A design's evidence lives in a spike under `research/<name>/`, and the design doc links the spike
instead of repeating its numbers or its method. A spike's README is its landing page, and its full
report is the `results.md` beside it; the [spikes index](../../../research/README.md) gives what
each one holds. A spike is deleted once its finding sits in the architecture doc that owns it, and a
link that cites a deleted spike points at the commit that last held it.

Planned work, open choices and later stages live in the nixie Linear project, and a doc links the
issue instead of restating the question.

## Architecture areas

The areas of `docs/architecture/` follow the design's: `core/`, `policy/`, `connectors/` and
`channels/`, beside the architecture overview.

## Voice

Guides, runbooks and design docs address the reader as "you", the one person a nixie deployment
works for. A sentence drops the actor where the actor adds nothing: "memory shows in 2 ways", not
"you see memory in 2 ways".

Architecture docs are declarative and third person, and call that person "the user": "a task waits
for the user's next message". The docs never write "the owner".

Terms follow the [glossary](../../../docs/glossary.md), one meaning each. "Run" always takes its
noun: job run, task run, worker run or code run.
