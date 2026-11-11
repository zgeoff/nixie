# Gaps in the work list

[The work list](work-list.md) holds every slice in build order. This doc lists the work that a slice
uses and that no slice holds, and the places where a slice of one milestone uses a part of a
milestone after it. Read it before you plan a milestone. Each gap needs a slice, or a decision,
before the slices that name it are complete.

## Work that no slice holds

- **The runner that a definition's version asks for.** Step 3 of `resolve` and the `runner` key of a
  definition file. tasks-8 skips the step, and definitions-1 builds no `runner` key. Both wait for
  the open item "runner key".
- **The read of a recovery hold for a definition's task.** definitions-2 and definitions-5 leave it
  out, and operations-13 and operations-15 name the definitions work. The open item is "recovery
  hold fire".
- **The `one-off` turn profile and the turn outcome `limit`.** tasks-9 uses both, and only
  harnesses-3 builds them. No slice states what a worker run does without them.
- **A `worker` image key, its record and a `worker` size row.** The sandboxes slices name them as
  work of the tasks slices, and the worker doc puts them out of scope. tasks-9 runs a worker at the
  `systemTask` size row.
- **The task runner for the eval of memory settings.** memory-gate-8 needs it, and no slice builds
  it.
- **The design of approval forwarding.** ports-2 needs it, and no slice holds it.
- **The builds after 3 decisions.** moments-7, moments-8 and moments-9 are each a decision. The
  build that follows each one has no slice. A build after moments-8 needs harnesses-3 and
  harnesses-9.
- **The rename in the rule format.** definitions-8 has no outcome and no check until the open item
  "rule format rename" is decided.
- **Short IDs on `leftOut` and `lines` in the record of a recall.** `leftOut` arrives with
  memory-index-1, beside web-3 in milestone 1, and neither slice states which one covers it.
  memory-index-4 records `lines` by the rule of web-3.
- **`collectOwnValues`.** harnesses-9 and web-9 both use it. The slice that lands first adds it.

## Slices that ship as a pair

The check of one slice passes only with the other, so each pair is one pull request.

- memory-index-2 and memory-gate-6: the label-only cases need the gate's rule, and the gate's rule
  needs the label fields.
- operations-12 and operations-13: the cases of operations-12 need a column that the migration of
  operations-13 adds.

## A slice that uses a part of a milestone after it

- **tasks-9 (milestone 3) and harnesses-3 (milestone 4).** tasks-9 uses the `one-off` turn profile
  and the turn outcome `limit`.
- **definitions-2 and definitions-5 (milestone 3) and operations-13 (milestone 4).** Both leave out
  the read of a recovery hold until operations-13.
- **memory-gate-4 and operations-6 (both milestone 1).** operations-6 is the rollback check. It has
  no pass rule until its open items are decided, so the deploy of milestone 1 waits for them.
- **sandboxes-6 (milestone 4).** It needs harnesses-3. To land the image set sooner, build it on the
  harness record that stands.
- **operations-13 (milestone 4) and tasks-3 (milestone 3)** edit one claim. tasks-3 lands first.
