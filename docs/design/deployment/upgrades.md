# Upgrades

- Decisions: [0020](../../decisions/0020-deployment.md),
  [0025](../../decisions/0025-database-and-topology.md)

An upgrade is a merged pull request that changes the nixie image digest in the deployment repo, and
a rollback is a revert of that commit. nixie copies the database before every migration. Each
release keeps its schema readable by the release before it, so a rollback by one release needs no
restore.

## The pin and the bot

The Compose file names the image by tag and digest, such as
`ghcr.io/<owner>/nixie:<version>@sha256:<digest>`. Renovate opens a pull request for each release
through its [docker-compose manager](https://docs.renovatebot.com/modules/manager/docker-compose/).
The release notes list each migration and whether the release before can read the schema it leaves.
The nixie image carries its imp images' digests, so one pull request moves every image, the SDK
included.

## Delivery

Delivery is deployment configuration. The Compose recipe runs one deploy script from a systemd timer
every 5 minutes, by hand, or from a webhook:

| Route   | Needs                                  | Delay after a merge | Inbound route |
| ------- | -------------------------------------- | ------------------- | ------------- |
| Poll    | A deploy key with read access, a timer | Up to the interval  | None          |
| Webhook | A public endpoint, a shared secret     | Seconds             | Yes           |
| Manual  | One command on the host                | When you run it     | None          |

The script runs these stages:

1. `git fetch`, and stop when the branch has no new commit.
2. `git merge --ff-only`, and stop if the checkout cannot fast-forward.
3. `docker compose pull`, while the old version keeps running.
4. `docker compose up -d --wait`, which replaces the container.
5. On failure, report it and leave the failed state.

The script never rolls back on its own. **Why:** a rollback is a revert, and a host that ran an
image other than its pin would break the commit as the record of what ran.

## A release on the host

1. **Stop.** On `SIGTERM`, nixie stops claiming steps and gives steps in flight up to 30 s to
   commit. The next start recovers an interrupted step as after a crash, under
   [tasks](../core/tasks.md).
2. **Copy.** When the release migrates the schema, nixie copies the database with `VACUUM INTO`
   before the first migration. It never copies the key store.
3. **Migrate.** Each migration runs in one transaction with the schema version.
4. **Add images.** nixie adds each imp image in its manifest to impd, and keeps the previous
   release's images until the next upgrade.
5. **Replace the conversation imp.** The new imp rebuilds its context from the event log, because
   the SDK transcript is a cache.
6. **Seed** the definitions, as [deployment](./deployment.md#seeding-the-definitions) describes.
7. **Ready.** Runners claim work.

## Migrations

Each build records the schema version it writes and the oldest schema it can read. A build refuses
to start on a schema newer than it can read, and logs the restore it needs.

A release expands the schema: new tables, columns with defaults, or indexes. A removal or rename
waits until the release before no longer needs that shape. A release counts as backward-compatible
only when the older build can both read and write the newer data. **Why:** reverting one release
then needs no restore and loses no writes. A release that cannot follow the rule marks its schema
unreadable by the release before, and its pull request says so.

## Rolling back

A rollback is `git revert` of the upgrade commit and a deploy. When the older build reads the
schema, the deploy completes the rollback with no writes lost. The first build supports a rollback
by one release only.

A later stage adds `nixie rollback` for a schema the older build refuses. It writes the
incomplete-recovery marker, sets the current database aside, puts the pre-migration copy in place,
and keeps the live key store. Writes since the upgrade are lost. Before startup, it imports every
action from the set-aside database into the restored log with its outcome, and installs recovery
holds for the affected tasks. **Why:** a task resumed from its pre-upgrade step would repeat those
actions.

Every ID that keys the key store is random, such as a UUID, never a row number. **Why:** after a
rollback, the live key store holds keys for rows the restored database lacks, and a reused row
number would collide with them. Cleanup of those orphaned keys follows the forget contract in
[backup and restore](./backup-and-restore.md), after it proves no retained data needs them.

On Kubernetes, the Pulumi program changes the digest, and a rollback reverts it in the
infrastructure repo.
