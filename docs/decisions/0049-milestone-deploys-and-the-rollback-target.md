# 0049: Milestone deploys and the rollback target

- Date: 2026-11-11
- Status: decided

## Decision

A deployment takes nixie's releases in milestones and skips the releases between them. A rollback
goes back to the last release that the deployment ran, which can be several releases back.

1. **The rollback target.** A rollback's target is the last release that the deployment ran, and
   never a release between it and the one deployed. Each design states what that release does with
   every record kind, migration and config key the design adds: it reads it, skips it, refuses to
   start on it, or never meets it. A design whose statement is "refuses to start on it" also gives
   the step a rollback takes.
2. **A check before the deploy.** Before a milestone deploy, a check starts the rollback target on a
   log and a config that the release to deploy wrote.
3. **Config keys first.** A rollback first removes the config keys that the rollback target does not
   know, as a step you approve.
4. **One exception.** No rollback crosses the migration that drops the column of the memory items'
   sensitive flag, which [0052](0052-the-lean-memory-index.md) decides. The way back across it is a
   restore from a backup taken directly before that deploy.

## Why

- A deployment holds real memory, so it meets a feature only once the whole feature is built.
- A rollback by release keeps the log, so it keeps every turn since the deploy.
- No test starts an earlier release on a newer log. Without the check, the first proof of a rollback
  is the rollback itself.
- An older release refuses to start on a config file that holds a key it does not know, so the keys
  go before the release does.

## Rejected alternatives

| Option                                          | Why not                                     |
| ----------------------------------------------- | ------------------------------------------- |
| deploy each release                             | each half-built feature runs on real memory |
| milestones, with a restore as the only rollback | it loses every turn since the deploy        |

## Consequences

- The promise of a rollback by one release grows to a rollback by one milestone.
- A design that adds a record kind, a migration or a config key that the rollback target cannot meet
  names the step a rollback needs.
- The deploy that drops the sensitive flag's column needs a backup directly before it.
