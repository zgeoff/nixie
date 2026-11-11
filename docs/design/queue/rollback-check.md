# The rollback check before a milestone deploy

A [milestone](work-list.md) is a group of nixie's releases that a deployment takes in one deploy:
the deployment goes from the release it runs straight to the milestone's last release. The rollback
target of that deploy is the release that the deployment ran before it, which can be several
releases behind the one deployed. The rollback check proves, before the deploy, that the rollback
target starts on a database and a config file that the release to deploy wrote. Without the check,
the first proof of a rollback is the rollback itself.

Most of the check is not designed. This doc gives what
[decision 0049](../../decisions/0049-milestone-deploys-and-the-rollback-target.md) settles and what
follows from it. [The open list](open/operations.md) holds each choice that the decision does not
settle, with a link to the check's tracker issue, and this doc marks each as `(open: <name>)`. Other
terms are in the [glossary](../../glossary.md).

## Built

This section gives what the code and the repo's rules do. The sections after it give the design.

- A rollback by one release works: a migration check in CI fails a release whose database schema the
  release before cannot read, as [upgrades](../platform/deployment/upgrades.md#rolling-back)
  describes.
- The database stores `oldest_reader`, the lowest schema version that can read it. A release refuses
  to start on a database whose `oldest_reader` is above the release's own schema version, with
  `SchemaTooNewError`.
- Config objects are strict. A release refuses to start on a config file that holds a key it does
  not know.
- `startSpawnedNixie` starts the server as a child process on a data directory, for tests. It starts
  only the server that is built from the checked-out commit.

## What decision 0049 settles

- A rollback goes to the rollback target, and never to a release between it and the one deployed.
- Before a milestone deploy, a check starts the rollback target on a database and a config that the
  release to deploy wrote.
- You remove the config keys that the rollback target does not know, as the first step of a
  rollback.
- Each design states what the rollback target does with every record kind, migration and config key
  that the design adds. The statement is one of 4: the rollback target reads it, skips it, refuses
  to start on it, or never meets it.
- A rollback never crosses the migration that drops the column of the memory items' sensitive flag.
  [Decision 0052](../../decisions/0052-the-lean-memory-index.md) decides that migration. The way
  back across it is a restore from a backup that you take directly before the deploy that runs it.

## What follows for the check

- The check starts the rollback target, and never a release between it and the release to deploy.
- The release to deploy writes the check's database and config. How the check makes it write them is
  not designed (open: check log).
- The check then removes from that config the keys that the rollback target does not know, as the
  first step of a rollback does.
- The expected result for each record kind, migration and config key is the statement of the design
  that adds it.
- When a design's statement is "refuses to start on it", the design also gives the step that a
  rollback needs. The check expects the refusal, then takes that step and expects a start.
- The check never starts the rollback target on a database that the sensitive flag's migration
  changed. What the check does for the milestone with that migration is part of (open: check pass).
- The check is bound by the rule of [the evidence lanes](evidence-lanes.md): it never sends a
  message to the agent of a production deployment.

For one milestone, the check's config is given. The memory family's design deletes the note-taker
and the consolidator, the 2 built-in memory tasks, and each has a config key `enabled`. The tests
that start nixie as a child process share one constant: a config that sets only those 2 keys to
`false`. For the milestone with the delete, the check's config is that constant.

## What is not designed

Each line is an item of the open list:

- where the check runs (open: check location);
- how the check learns the rollback target of a deployment (open: rollback target source);
- how the database of the release to deploy is made (open: check log);
- what counts as a pass (open: check pass);
- where the expected result for each record kind, migration and config key is stored (open: expected
  results);
- whether a failed check blocks the release or only the milestone deploy (open: check blocks);
- whether the check also starts a release behind the rollback target, for a deployment that skipped
  a milestone (open: further back);
- whether a test lane can build and start the server of a previous release (open: previous bundle);
- whether the designs' statements, which were written about the release directly before, are true of
  a rollback target that is 2 or more releases behind (open: one release back).

## Not in scope

- The command `nixie rollback`, and the recovery holds that it places on tasks.
  [Backup and recovery](backup-and-recovery.md) owns the recovery hold.
- The removal of the config keys on a deployment, which you do.
- The backup before the deploy that drops the sensitive flag's column.
