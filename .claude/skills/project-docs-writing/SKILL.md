---
name: project-docs-writing
description:
  nixie's own rules for repo prose, on top of the shared docs-writing skill. Use with docs-writing
  whenever you write, edit, or review prose in this repo.
---

# Project docs writing

Load the shared `docs-writing` skill first. Where the two skills disagree, this one wins.

## What each docs folder holds

- **`docs/architecture/`** explains what is built: the parts, their boundaries, which part owns
  which state, and the invariants, each with a `**Why:**` line. It leaves out what a reader can
  infer from the code.
- **`docs/decisions/`** holds permanent records. A record states the choice, the alternatives it
  rejected and why, and keeps its date in the header. It never describes how the system works now. A
  changed decision is edited in place: the record keeps its number and states the decision as it now
  stands, its header gains an `Updated` date, and a `## Changes` list at its end gives each change's
  date and a one-line summary. The `## Changes` list is the one place a record holds history.
- **`docs/design/<work>/`** holds a design for big, speculative work, written well before its code.
  A design doc states contracts: what each part does, its interfaces, its guarantees, and the reason
  for each one. Evidence lives in the design's spikes, in `docs/design/<work>/spikes/<name>/`, and
  the doc links the spike instead of repeating its numbers or its method. The owner opens a design;
  an agent never opens one by default.
- **`docs/guides/`, `docs/runbooks/` and `docs/reference/`** hold steps a user does, operator and
  contributor procedures, and generated reference only.

A plan for work about to be built lives in its Linear issue or PR, never in `docs/`. Planned work,
open choices and later stages live in the nixie Linear project, and a doc links the issue instead of
restating the question.

When work from a design lands, its PR moves the built part into `docs/architecture/`, rewritten to
describe the code, and deletes the rest of the design folder, spikes included, once nothing in it is
unbuilt.

## Size

- A doc past 250 lines, or 300 for a runbook: cut points first, then split it at a real code
  boundary. If it is still over, say so in the PR body. Never compress sentences to fit.
- The root README is a plain repo README: about 50 lines, and never more than 60. It holds one
  paragraph, a quick start, the checks, the layout and a docs link, and never flags, config keys or
  tables of states.
- `docs/README.md` is the one index. An area of `docs/architecture/` gets a subfolder once it passes
  about 6 docs.

## Voice

The docs address the reader as "you", the one person a nixie deployment works for. A sentence drops
the actor where the actor adds nothing: "memory shows in 2 ways", not "you see memory in 2 ways".
The docs never write "the owner".

Terms follow the [glossary](../../../docs/glossary.md), one meaning each. "Run" always takes its
noun: job run, task run, worker run or code run.
