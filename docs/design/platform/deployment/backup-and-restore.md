# Backup and restore

- Decisions: [0032](../../../decisions/0032-offsite-backups-and-replication.md),
  [0010](../../../decisions/0010-memory-store.md), [0020](../../../decisions/0020-deployment.md),
  [0035](../../../decisions/0035-backup-sidecar.md)

nixie backs up its SQLite database and its key store every hour by default. nixie copies each with
`VACUUM INTO`, and the backup sidecar sends the copies to 2 restic repos that hold only ciphertext.
The data repo keeps long retention, and the key repo keeps one snapshot. A new host restores from
the 2 repos, the deployment repo and your recovery key. The
[deploy spike](../spikes/deploy-local/README.md) ran every step here on local containers.

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

## nixie and the backup sidecar

Backups run in 2 containers. nixie owns consistency: it is the single writer, so it alone opens the
databases and makes each copy. The backup sidecar, `nixie-backup`, owns transport: it runs restic,
and later Litestream and the rclone gateway, and it never opens a database. **Why:** the restic
password and the backend credentials then live only in the sidecar, so a fault in nixie's process
never reaches them, and the backup tools stay out of the nixie image.

The sidecar runs beside nixie, in the same pod on Kubernetes and in the same Compose project. The 2
containers share one staging directory on the data volume, and the sidecar mounts only that
directory. They exchange 2 kinds of file there:

- **A snapshot set:** a directory nixie writes, holding the copies, a manifest and a `complete`
  marker. The manifest records the set's kind (scheduled or forget), its sequence number and a
  checksum of each copy. nixie writes the marker last.
- **A receipt:** a file the sidecar writes beside the set once the set is published. It holds the
  restic snapshot IDs, and for a key set the results of the prune and the check.

The sidecar publishes only a set whose marker exists and whose copies match their checksums. It
publishes sets one at a time, in sequence order, and removes a set's copies after its receipt. The
formats live in `libs/wire`, and a release reads its own format and the one before.

## A backup run

1. nixie copies `nixie.db` and `keys.db` with `VACUUM INTO` into a new snapshot set, while writers
   continue, then writes the manifest and the marker.
2. The sidecar backs up the database copy to the data repo, and the key store copy to the key repo.
3. restic applies retention to the data repo. In the key repo it keeps the new snapshot, forgets
   every other snapshot in every host and path group, and prunes with `--max-unused 0`.
4. The sidecar writes the receipt and removes the set's copies.
5. nixie records the snapshot IDs from the receipt.

| Setting              | Default                                 |
| -------------------- | --------------------------------------- |
| Backup interval      | 1 hour                                  |
| Data repo retention  | 24 hourly, 7 daily, 4 weekly, 6 monthly |
| Key repo retention   | One snapshot, fixed                     |
| Pre-migration copies | The newest 3, on the data volume        |

The interval and the data retention are settings. The key repo's single snapshot is part of forget,
not a tuning value. The interval bounds the writes a failed disk loses.

nixie sends a push notice when a set gets a failed receipt or none within the interval, and
readiness reports backups unready once the last receipt is older than twice the interval. The
sidecar runs `restic` with the repo password in the child process's environment only. A repo lives
on any restic backend the deployment picks.

## The key repo and forget

The key store has its own repo because a repo with normal retention keeps every old copy of the key
store, and with it every key a forget deleted. In the deploy spike, an item forgotten between 2 runs
came back in full from an older snapshot of one combined repo. With a separate key repo that keeps
one snapshot and prunes every unused byte, the item stayed unreadable while older database snapshots
still restored.

### Forget-triggered key cleanup

nixie deletes a key from the live store with SQLite's `secure_delete` on and checkpoints the
write-ahead log. A forget then stages a key set at once instead of waiting for the schedule. The
[memory store](../memory/store.md) owns the forget contract. Deployment meets it this way:

1. The sidecar uploads the set's key snapshot, which lacks the deleted keys, forgets every other key
   snapshot, and prunes their unused data. Forgetting snapshots without a prune left a blob that
   still decrypted the item in the [key-backup spike](../spikes/forget-backups/README.md).
2. The sidecar checks the remaining repository data and fetches every surviving key snapshot and an
   older data snapshot into a check directory. nixie opens those copies read-only and confirms that
   the forgotten items stay unreadable. nixie never opens a check copy for writing, so the check
   leaves the single writer untouched.
3. The sidecar removes the set's copies, the check copies and its backup cache copies, then writes
   the receipt.
4. The forget stays pending until every registered key copy has a receipt. An error, a failed prune,
   an unavailable backend or a crash keeps it pending, and recovery resumes the same operation. It
   never restores an old key to reverse a partial deletion.

nixie makes key copies one at a time, and takes a key set's sequence number when its copy starts. A
forget's delete waits until any key copy in progress has written its marker, so every copy that read
a key before its delete has a lower sequence number than the forget's own set. A forget completes
only on the receipt of a key set staged after its delete. An earlier key copy can still publish
first, because the sidecar publishes in sequence order, and the forget's own set then forgets and
prunes that copy before the forget completes. A later stage adds a generation barrier that rejects
stale staged copies, so key publication and forget run concurrently.

A backend counts as registered only if its credentials allow deletion and its versioning or
immutable retention keeps no unmanaged copy. A backend that cannot meet that condition never reports
a completed forget. The key repo serves host recovery only, never an upgrade rollback, because
restoring an older key copy brings a forgotten item back.

## The offsite replica

A later stage adds Litestream, which replicates `nixie.db` offsite to the S3-compatible storage the
deployment configures. Litestream and the rclone gateway run in the backup sidecar. The replica
sends its objects to the gateway, which listens on the sidecar's loopback and uses a crypt remote
that encrypts payloads and filenames before upload, so the provider never holds readable pages. The
crypt password and salt live in the sidecar's secrets. A restore needs that configuration as well as
the objects.

Litestream reads the live database and its write-ahead log, so at that stage the sidecar mounts the
data directory as well. Litestream never takes the
[writer lock](../core/event-log.md#the-single-writer) and never writes a transaction. Its WAL
checkpoints go through SQLite's own locks, which hold because both containers run on one kernel. The
replica stage's spike sets nixie's checkpoint settings beside it.

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
2. Fetch the newest database snapshot and the key store snapshot with the sidecar, which checks each
   against its restic snapshot:

   ```bash
   docker compose run --rm --no-deps nixie-backup fetch data latest
   docker compose run --rm --no-deps nixie-backup fetch keys latest
   ```

3. Install them with nixie, which takes the writer lock, moves the copies into the data directory
   and installs recovery holds:

   ```bash
   docker compose run --rm --no-deps nixie restore
   ```

4. Start nixie with `docker compose up -d --wait`. Expect the client to become ready once impd
   answers, with recovered work held for your review.
5. Make a new host key, add it to both secrets files with `sops updatekeys`, commit, and put the
   recovery key away.

On Kubernetes, the StatefulSet scales to 0, and a one-off pod on the same volume runs the sidecar's
fetch and then nixie's restore. The sidecar only fetches and checks. nixie alone replaces the
database, under the writer lock, while no other nixie runs.

A restored database is up to one interval older than the lost host, so an action may have run after
the backup. The restore command installs [recovery holds](../core/tasks.md) before startup. Task
claims, autonomous job runs and new actions stay held until you resume each task. The client shows
when the backup was taken and which tasks were running. **Why:** a task resumed at once would repeat
its last uncommitted step, and only you can check the outside world.

A later stage adds a monthly restore check. The sidecar fetches the newest snapshot of each repo
into a check directory. nixie opens the copies read-only, runs SQLite's integrity check, decrypts a
sample of memory items, and sends a push notice on failure. **Why:** decrypting a sample needs the
deployment key, which stays in nixie.
