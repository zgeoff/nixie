# 0049: Milestone deploys and the rollback target

- Date: 2026-11-11
- Status: decided
- Design: [the rollback check](../design/queue/rollback-check.md)

A deployment takes nixie's releases in milestones and skips the releases between them. A rollback
goes back to the last release that the deployment ran, which can be several releases back.

These choices settle a milestone deploy:

1. **The rollback target.** A rollback's target is the last release that the deployment ran. Each
   design states what that release does with every record kind, migration and config key the design
   adds: it reads it, skips it, refuses to start on it, or never meets it.
2. **A check before the deploy.** Before a milestone deploy, a check starts that last release on a
   log and a config that the new release wrote.
3. **Config keys first.** A rollback first removes the config keys that the older release does not
   know, as a step you approve.
4. **One exception.** No rollback crosses the migration that drops the sensitive flag's column,
   which [0052](0052-the-lean-memory-index.md) decides. The way back across it is a restore from a
   backup taken directly before that deploy.

## Why

- A deployment holds real memory, so it meets a feature only once the whole feature is built.
- A rollback by release keeps the log, so it keeps every turn since the deploy.
- No test starts an earlier release on a newer log. Without the check, the first proof of a rollback
  would be the rollback itself.
- An older release refuses to start on a config file that holds a key it does not know, so the keys
  go before the release does.

## Alternatives

- **Deploy each release.** A rollback is then one release back, and each half-built feature runs on
  real memory.
- **Milestones with a restore as the only rollback.** It needs no check and no statement from each
  design, and it loses the turns since the deploy.

## Consequences

- The promise of a [rollback by one release](../design/platform/deployment/upgrades.md#rolling-back)
  grows to a rollback by one milestone.
- A design that adds a record kind, a migration or a config key that the last release cannot meet
  names the step a rollback needs.
- The deploy that drops the sensitive flag's column needs a backup directly before it.
