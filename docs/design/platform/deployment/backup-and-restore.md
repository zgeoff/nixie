# Backup and restore

- Decisions: [0032](../../../decisions/0032-offsite-backups-and-replication.md),
  [0010](../../../decisions/0010-memory-store.md), [0020](../../../decisions/0020-deployment.md)

nixie backs up its SQLite database and its key store every hour by default. It copies each with
`VACUUM INTO` and sends the copies to 2 restic repos that hold only ciphertext. The data repo keeps
long retention, and the key repo keeps one snapshot. A new host restores from the 2 repos, the
deployment repo and your recovery key. The [deploy spike](../spikes/deploy-local/README.md) ran
every step here on local containers.

## What a backup holds

| Store             | Holds                                                       | Backed up                     |
| ----------------- | ----------------------------------------------------------- | ----------------------------- |
| `nixie.db`        | The event log, task state, memory and credential ciphertext | The data repo, long retention |
| `keys.db`         | Every per-item, per-record and per-contact key, wrapped     | The key repo, one snapshot    |
| SDK session cache | The live SDK transcript of each session                     | Never                         |
| Deployment repo   | The Compose file, the pin and the sops file                 | Its own git host              |
| Definitions repo  | Persona, jobs and the policy seed                           | Its own git host              |
| Host key          | The age key that decrypts the sops file on this host        | Never                         |

The host key needs no backup, because your recovery key is a second recipient of the sops file. The
SDK transcript is a cache that a task rebuilds from the event log, as
[memory context](../memory/context.md) describes.

## A backup run

1. nixie copies `nixie.db` and `keys.db` with `VACUUM INTO` into a staging directory, while writers
   continue.
2. restic backs up the database copy to the data repo, and the key store copy to the key repo.
3. restic applies retention to the data repo. In the key repo it keeps the new snapshot, forgets
   every other snapshot in every host and path group, and prunes with `--max-unused 0`.
4. nixie removes the staging directory and records the snapshot IDs.

| Setting              | Default                                 |
| -------------------- | --------------------------------------- |
| Backup interval      | 1 hour                                  |
| Data repo retention  | 24 hourly, 7 daily, 4 weekly, 6 monthly |
| Key repo retention   | One snapshot, fixed                     |
| Pre-migration copies | The newest 3, on the data volume        |

The interval and the data retention are settings. The key repo's single snapshot is part of forget,
not a tuning value. The interval bounds the writes a failed disk loses.

A failed run sends a push notice, and readiness reports backups unready once the last success is
older than twice the interval. nixie runs `restic` itself, with the repo password in the child
process's environment only. A repo lives on any restic backend the deployment picks.

## The key repo and forget

The key store has its own repo because a repo with normal retention keeps every old copy of the key
store, and with it every key a forget deleted. In the deploy spike, an item forgotten between 2 runs
came back in full from an older snapshot of one combined repo. With a separate key repo that keeps
one snapshot and prunes every unused byte, the item stayed unreadable while older database snapshots
still restored.

### Forget-triggered key cleanup

nixie deletes a key from the live store with SQLite's `secure_delete` on and checkpoints the
write-ahead log. A forget then starts a key backup at once instead of waiting for the schedule. The
[memory store](../memory/store.md) owns the forget contract. Deployment meets it this way:

1. The backup job uploads a fresh key snapshot without the deleted keys, forgets every other key
   snapshot, and prunes their unused data. Forgetting snapshots without a prune left a blob that
   still decrypted the item in the [key-backup spike](../spikes/forget-backups/README.md).
2. It checks the remaining repository data and restores every surviving key snapshot against an
   older data snapshot, to confirm that the forgotten items stay unreadable.
3. It removes staging files and backup cache copies, then records its receipt.
4. The forget stays pending until every registered key copy has a receipt. An error, a failed prune,
   an unavailable backend or a crash keeps it pending, and recovery resumes the same operation. It
   never restores an old key to reverse a partial deletion.

In the first build, key-store staging, key publication and forget share one exclusive lock, so no
backup can publish a key copy staged before a forget. A later stage replaces the lock with a
generation barrier that rejects stale staging copies.

A backend counts as registered only if its credentials allow deletion and its versioning or
immutable retention keeps no unmanaged copy. A backend that cannot meet that condition never reports
a completed forget. The key repo serves host recovery only, never an upgrade rollback, because
restoring an older key copy brings a forgotten item back.

## The offsite replica

A later stage adds Litestream, which replicates `nixie.db` offsite to the S3-compatible storage the
deployment configures. The replica sends its objects to a local rclone S3 gateway over a crypt
remote, which encrypts payloads and filenames before upload, so the provider never holds readable
pages. The crypt password and salt live in the sops file. A restore needs that configuration as well
as the objects.

Litestream never replicates `keys.db`, because its retained history would keep deleted keys. Hourly
key snapshots alone leave new encrypted items unrecoverable for up to an hour after host loss, so
the replica waits on a matching-key recovery path. The
[paired recovery spike](../spikes/paired-recovery/README.md) restores new content once the matching
key snapshot exists. The [replica encryption spike](../spikes/replica-encryption/README.md) tests
the gateway through process outages. Neither tests a cloud provider.

## Restoring on a new host

A restore needs 3 things the lost host does not take: the restic repos, the deployment repo and your
recovery key. On a host that meets [the host's needs](deployment.md#the-host):

1. Clone the deployment repo, and put the recovery key where the Compose file expects the host key.
2. Restore the newest database snapshot and the key store snapshot:

   ```bash
   docker compose run --rm --no-deps nixie restore data latest /data
   docker compose run --rm --no-deps nixie restore keys latest /data
   ```

3. Start nixie with `docker compose up -d --wait`. Expect the client to become ready once impd
   answers, with recovered work held for your review.
4. Make a new host key, add it with `sops updatekeys`, commit, and put the recovery key away.

A restored database is up to one interval older than the lost host, so an action may have run after
the backup. The restore command installs [recovery holds](../core/tasks.md) before startup. Task
claims, autonomous job runs and new actions stay held until you resume each task. The client shows
when the backup was taken and which tasks were running. **Why:** a task resumed at once would repeat
its last uncommitted step, and only you can check the outside world.

A later stage adds a monthly restore check: nixie restores the newest snapshot of each repo into a
scratch directory, runs SQLite's integrity check, decrypts a sample of memory items, and sends a
push notice on failure.
