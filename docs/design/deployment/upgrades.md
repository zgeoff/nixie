# Upgrades

- Status: Proposed
- Decisions: [0020](../../decisions/0020-deployment.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

An upgrade is a merged pull request that changes the nixie image digest in the deployment repo, and
a rollback is a revert of that commit, under [0020](../../decisions/0020-deployment.md). The
deployment decides how each new commit reaches its hosts; a host script is the Compose reference
recipe. nixie takes a database copy before every migration, and each release keeps its migrations
readable by the release before it, so a rollback by one release needs no restore. A rollback further
back restores the copy from before the migration and loses the writes made since. Everything in this
doc beyond the decisions it links is a proposal.

## The pin and the bot

The Compose file names the image by tag and digest, such as
`ghcr.io/<owner>/nixie:<version>@sha256:<digest>`. Renovate, the bot 0020 picks, opens a pull
request for each release through its
[docker-compose manager](https://docs.renovatebot.com/modules/manager/docker-compose/). The release
notes in the pull request list each migration and whether the previous release can read the schema
it leaves. The deploy spike pushed 2 builds to a local registry, pinned each by digest, and pulled
the pinned image with no local copy present.

The nixie image carries the digests of its imp images, as [deployment](./deployment.md#the-image)
describes, so one pull request moves every image together. The SDK and its Claude Code build arrive
inside a nixie release, so the owner never tracks them on their own.

## Delivery

A merge has to reach the host. 3 routes do it:

| Route   | Needs                                  | Delay after a merge | Inbound route |
| ------- | -------------------------------------- | ------------------- | ------------- |
| Poll    | A deploy key with read access, a timer | Up to the interval  | None          |
| Webhook | A public endpoint, a shared secret     | Seconds             | Yes           |
| Manual  | The owner runs one command on the host | When the owner acts | None          |

Delivery is deployment configuration under 0020. The Compose reference recipe uses a systemd timer
every 5 minutes, with the same script available by hand or from a webhook. An orchestrator can
replace that recipe while preserving the platform's stop, migration and recovery contract.

The deploy script runs these stages:

1. `git fetch`, and stop when the deployment branch has no new commit.
2. `git merge --ff-only` to the fetched commit, so the Compose file on disk holds the new pin. A
   checkout that cannot fast-forward stops the script.
3. `docker compose pull`, so the old version keeps running while the new image downloads.
4. `docker compose up -d --wait`, which stops the old container and starts the new one.
5. On failure, report to the heartbeat service from
   [deployment](./deployment.md#health-and-monitoring) and leave the failed state for the owner.

The script never rolls back on its own. **Why:** a rollback is a revert in the repo, and a host that
ran an older image than its pin would break the commit as a record of what ran, the problem with
unattended image pulls that the
[deployment notes](../../research/2.6-notes/deployment.md#upgrades-from-the-repo) describe.

## A release on the host

nixie stops and starts in these stages:

1. **Stop.** On `SIGTERM`, nixie stops claiming steps and gives the steps in flight up to 30 s to
   commit, the Compose `stop_grace_period`, which the owner can change. A step that has not
   committed by then is interrupted, and the next start recovers it as after a crash, under
   [tasks](../core/tasks.md#crash-recovery).
2. **Copy.** When the new release migrates the schema, nixie copies the database with `VACUUM INTO`
   to the data volume before the first migration. It copies the database only, never the key store.
3. **Migrate.** Each migration runs in one transaction with the schema version.
4. **Add images.** nixie adds each imp image named in its manifest to impd, and keeps the previous
   release's images until the next upgrade, so a rollback finds them.
5. **Replace the conversation imp** from the new conversation image after the old runner stops. Its
   local SDK transcript is a cache, so replacement rebuilds application context from the canonical
   log, task state and eligible summary under
   [0031](../../decisions/0031-memory-capture-context-and-removal.md). It does not promise identical
   SDK context or cache continuity. Unchanged worker images can retain their own valid caches; a
   replaced worker follows the same rebuild contract.
6. **Seed** the definitions, as [deployment](./deployment.md#seeding-the-definitions) describes.
7. **Ready.** Runners claim work, and the readiness list turns ready.

In the deploy spike, an upgrade from pull to healthy took 6.5 s on a small database. Bun ignored
`SIGTERM` as PID 1 until the app handled it, and each stop took the full 10 s before that.

## Migrations

Each build records the schema version it writes and the oldest schema it can read. A build refuses
to start on a schema newer than it can read, and logs the reason and the restore it needs. In the
deploy spike, build 1 exited on build 2's schema with "database schema 2 is newer than build 1,
which knows schema 1; restore the backup taken before the upgrade", and Compose reported the start
as failed.

A release normally expands the schema with new tables, columns with defaults or indexes. A removal
or rename waits until the previous release no longer needs that shape. Migration authors check both
schema access and write compatibility before they label a release backward-compatible; an additive
schema alone does not prove that the older build can use the newer data. **Why:** the release before
can then read the schema each release leaves, so reverting one release needs no restore and loses no
writes.

A release that cannot follow that rule, such as one that rewrites a table's format, marks its schema
as unreadable by the release before, and the pull request states it. A rollback past it needs a
restore.

## Rolling back

A rollback starts with `git revert` of the upgrade commit and a deploy. When the older build can
read the schema, the deploy finishes the rollback, and nothing written since the upgrade is lost.

The first build never needs a restore to roll back, because each of its releases stays readable by
the release before it ([first build](./deployment.md#first-build)). A later stage adds the restore
path below.

When the older build refuses the schema, the owner restores the copy taken before the migration:

1. Stop nixie with `docker compose stop nixie`.
2. Run `nixie rollback`, which writes the incomplete-recovery marker before replacement, sets the
   current database aside, copies the newest pre-migration copy for the build's schema into place,
   and removes the old write-ahead log files. It completes the outcome import and recovery holds
   before clearing the marker.
3. Start nixie with `docker compose up -d --wait`.

The deploy spike ran these steps: build 1 refused build 2's schema, came back healthy at its own
schema after the restore, and lost the item written after the upgrade. An item forgotten after the
upgrade stayed forgotten, because the rollback kept the live key store.

The live key store then holds keys for items and records that the restored database lacks. Every ID
that keys the key store is therefore random, such as a UUID, never a row number the database hands
out. **Why:** with row numbers, the restored database handed the next item an ID whose key the
discarded span left behind, and the write failed on the key store's unique key. With random IDs, the
spike wrote an item after the rollback with no clash. The keys left behind stay until the owner
removes the set-aside database. Before deleting them, cleanup proves that no retained readable item,
record, credential or registered recovery copy still needs them. Unreferenced-key cleanup follows
the same durable key-backup removal contract as forget; it never deletes a live key solely because
the restored database lacks its row.

The restored database lacks every record written since the upgrade, including outside actions that
ran then. `nixie rollback` reads the set-aside database before it starts nixie, and writes a record
for each outside action in that span, with its outcome, into the restored log. The client lists
those actions for the owner beside the unknown outcomes from
[outside actions](../core/outside-actions.md#unknown-outcomes-and-the-owner), and the rollback
command installs [recovery holds](../core/tasks.md#recovery-holds) for affected tasks and autonomous
launch sources before startup. Crash recovery preserves those holds; only the corresponding checked
owner resume or re-enable clears them. **Why:** a task resumed from its pre-upgrade step would
repeat those actions, and without the record the restored log holds no trace of them.
`nixie rollback` reads only the outside action queue from the set-aside database, a table whose
migrations only add columns, so the older build reads it.

## Kubernetes

On Kubernetes, the owner's Pulumi program changes the digest, and a rollback reverts it in the
infrastructure repo. The one-replica StatefulSet stops the old pod before it starts the new one,
which gives the same stop, copy and migrate stages, and the restore runs as a one-off pod with the
data volume mounted.
