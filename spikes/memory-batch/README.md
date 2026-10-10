# Spike: batched memory capture without model calls

This spike checks whether a batch of conversation messages can produce durable memory proposals
without losing its cursor or source evidence after a process crash. It compares capture alone with
capture plus a stand-in session switch. It tests the checkpoint mechanics of a proposal, not a
choice to replace SDK compaction.

- Runtime: Bun 1.4.2 and its bundled SQLite, with WAL and `synchronous = FULL`.
- Input: synthetic owner messages, replies, a pasted message, a summary and predetermined candidate
  memories. No owner history, credentials, inference calls or Agent SDK sessions are used.
- Quote and destination-token checks: the implementation in
  [memory-checks](../memory-checks/checks.ts), imported directly rather than copied.

## Run it

Run from this directory:

```bash
bun install
bun run check
```

[run.ts](./run.ts) creates temporary databases, starts child Bun processes, kills them at known
boundaries with `SIGKILL`, resumes them and prints a JSON report. It removes the temporary
databases, fixture files and session artifacts after the run. Children receive only `PATH`; they do
not load environment files.

## What it checks

The batch stores a fixed upper message sequence before it reads model output. Messages that arrive
after that sequence belong to the next batch. The cursor advances in the transaction that saves the
proposals and marks the batch complete. In the rollover variant, that transaction records a prepared
session artifact's ID too. A crash before commit keeps the old cursor; a crash after commit keeps
the complete result.

Candidate source IDs must belong to the batch and point to a readable original owner message.
Replies, summaries, pasted spans, quoted blocks, absent quotes and invented destination tokens fail
the code checks. Publication reads those sources again inside its write transaction, so a source
that became unreadable after output was produced cannot back a proposal. An unreadable flag stands
in for key availability; this experiment performs no cryptographic deletion.

Count, idle and maximum age each trigger a batch. The fixture uses 4 owner messages, 5 minutes idle
and 20 minutes maximum age. Those values are experiment settings, not agreed product defaults. A
virtual clock checks exact thresholds, including a busy conversation whose replies prevent idle but
not maximum age.

## Results

The run passes its assertions. Twelve process-kill schedules cover 6 boundaries in each mode: after
batch preparation, after candidate output, after session preparation, inside the proposal
transaction, before commit and after commit. Each recovered run publishes the expected proposals
once, preserves original source order and drains the late message in its own batch.

The broken control commits its cursor before it saves proposals, then dies. Recovery skips all 3
expected proposals. The control demonstrates the loss that the atomic checkpoint prevents.

A forget race kills the worker after output, marks one source unreadable, then recovers. Only the 2
proposals from readable sources survive. Every stored proposal needs the model assertion check; the
experiment never auto-applies memory. An intentionally unrelated memory with a valid quote passes
the code checks, which confirms that the unrun assertion check remains necessary.

A 25-message batch exposes a conflict with the draft's 20-message evidence window: its first source
lies outside that window. Validation against the batch's original source ID accepts its exact typed
quote. A batched writer therefore needs source-bound validation over its fixed batch, rather than a
search limited to the latest 20 messages. This is a design requirement if batching is chosen.

## Limits

Model output is deterministic fixture data. Retries may repeat the extraction attempt; identical
outputs publish once through the checkpoint. The experiment does not prove that model calls happen
once, that nondeterministic retries select the same memories, or that semantic duplicates disappear.
The address fixtures preserve both versions as proposals in source order; they do not prove that a
model correctly revises an active item.

The session artifact is a JSON file with a fixed summary, not an SDK transcript or live session.
These results check a SQLite checkpoint and artifact ordering, not SDK session continuity, summary
quality, cache behavior, token costs, compaction inside a tool loop or external side effects. The
harness runs one conversation and one publisher at a time; task leases, competing publishers,
cross-thread provenance and physical power loss are outside this experiment.

The owner agreed a batched writer with SDK compaction retained. These results remain limited to the
checkpoint mechanics; custom rollover is not adopted. The
[memory design](../../docs/design/memory/writes.md#batch-boundaries-and-recovery) covers the batch
contract.
