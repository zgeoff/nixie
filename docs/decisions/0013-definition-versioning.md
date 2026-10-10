# 0013: Definition versioning

- Date: 2026-10-08
- Status: decided
- Research:
  [versioning notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-notes/definition-versioning.md)

Every record carries a hash of the definition set in force when nixie made it: persona, jobs and
policy, next to the rule ID from [0004](0004-rule-engine.md). nixie keeps each snapshot in its
database, keyed by hash, so a replay knows exactly which definitions applied. nixie computes a new
snapshot when the definitions source from [0020](0020-deployment.md) seeds the database or a rule
changes, and every record until the next change shares its hash.

A change reaches running tasks by kind:

- **Rules and policy apply at once,** to running tasks as well as new ones.
- **Persona and job definitions stay fixed** for the life of a task, at the versions it started
  with.

## Why

- A tightened rule must reach a task that is already running, and the always-ask set must never lag
  behind an edit.
- A task that changed its voice or its goals partway through would confuse you and the record.
- A snapshot per change, rather than per record, keeps the cost to one hash column on each record.

## Alternatives

- **Every running task keeps the definitions it started with.** Behaviour stays consistent within a
  task, and a tightened rule misses the tasks already running.
- **Every running task picks up every change.** A change applies everywhere at once, and a task can
  change voice or goals partway through.

## Consequences

- A record's snapshot hash covers the rules in force at the moment of the decision, while its
  persona and job versions are those the task started with. The record keeps both.
- The definitions source's commit is stored as a label on each snapshot, and a rule written at
  runtime carries the ID of the approval that created it.
- Memory versions separately, through the history table from [0010](0010-memory-store.md).
