# Backup and restore

- Status: Proposed
- Decisions: [0032](../../decisions/0032-offsite-backups-and-replication.md),
  [0010](../../decisions/0010-memory-store.md), [0020](../../decisions/0020-deployment.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0031](../../decisions/0031-memory-capture-context-and-removal.md)

nixie backs up its SQLite database and its key store every hour by default, with `VACUUM INTO`
copies sent to 2 restic repos that hold only ciphertext. The database goes to a repo with long
retention. The key store goes to its own repo, which keeps an acknowledged fresh snapshot. Forget
forces a refresh and removal of every older recoverable key copy before it reports completion, as
[0010](../../decisions/0010-memory-store.md) requires. The hourly interval controls ordinary
recovery age, not forget completion. A new host restores from the 2 repos, the deployment repo and
the owner's recovery key. The owner chose Restic snapshots plus an offsite Litestream data replica
to S3-compatible storage in the [deployment choices](./deployment.md#agreed-backup-design). The
matching-key recovery path remains open; the lifecycle details here are proposals beyond the linked
decisions.

The [deploy spike](../../../spikes/deploy-local/README.md) ran every step here on local containers,
and the [event log spike](../../../spikes/event-log-db/README.md) measured `VACUUM INTO` at scale.

## What a backup holds

| Store             | Holds                                                       | Backed up                     |
| ----------------- | ----------------------------------------------------------- | ----------------------------- |
| `nixie.db`        | The event log, task state, memory and credential ciphertext | The data repo, long retention |
| `keys.db`         | Every per-item, per-record and per-contact key, wrapped     | The key repo, newest only     |
| SDK session cache | The live SDK transcript per session                         | Never                         |
| Deployment repo   | The Compose file, the pin and the sops file                 | Its own git host              |
| Definitions repo  | Persona, jobs and the policy seed                           | Its own git host              |
| Host key          | The age key that decrypts the sops file on this host        | Never                         |

The key store holds the keys that the
[event log design](../core/event-log.md#erasable-fields-and-keys) places apart from the database,
each wrapped by the deployment key. The host key is never backed up: the owner's recovery key is a
second recipient of the sops file and takes its place on a new host.

The SDK transcript remains on its task's imp as a live cache under 0031. It leaves backups and
export out. A lost or invalid transcript rebuilds application context from the event log and
canonical task state; it does not restore identical SDK state. There is no mandatory transcript
mirror to the host. Durable files and task artifacts need their own ownership outside this cache.

## A backup run

A backup run takes 4 steps:

1. nixie copies `nixie.db` and `keys.db` with `VACUUM INTO` into a staging directory on the data
   volume, while writers continue.
2. restic backs up only the database file to the data repo, and the generation-tagged key store copy
   to the key repo. Key-repo publication takes the shared lifecycle lock and rejects stale staging
   generations; the staging directory as a whole never enters the data repo.
3. restic applies retention to the data repo. For the key repo it keeps the explicitly acknowledged
   fresh snapshot, removes every other snapshot in every host and path group and prunes with
   `--max-unused 0`. Removing snapshot references alone does not remove recoverable pack data.
4. nixie removes the staging directory and writes a record with the snapshot IDs and the time taken.

In the deploy spike, a run took about 3 s once both repos existed, and the first run took about 9 s
because `restic init` derives each repo key. The event log spike copied a 537 MB database with
`VACUUM INTO` in 1.0 s while 4 processes wrote to it.

| Setting              | Default                                 |
| -------------------- | --------------------------------------- |
| Backup interval      | 1 hour                                  |
| Data repo retention  | 24 hourly, 7 daily, 4 weekly, 6 monthly |
| Key repo retention   | The newest snapshot only                |
| Pre-migration copies | The newest 3, on the data volume        |
| Restore check        | Monthly                                 |

The ordinary backup interval and data retention are settings the owner can change. The key repo's
single-current-copy requirement is part of forget correctness, not a retention tuning value. An hour
bounds ordinary writes lost with a failed disk; forget-triggered cleanup does not wait for it.

A failed run sends the owner a push notice, and the health endpoint reports backups unready once the
last success is older than twice the interval, as
[deployment](./deployment.md#health-and-monitoring) describes.

nixie runs `restic` itself, with the repo password from the deployment's secrets in the child
process's environment only. A repo lives on any restic backend the owner picks, such as SFTP to
another machine or bucket storage, and holds only ciphertext with names and structure hidden
([storage notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-notes/data-and-storage.md#backups)).

## Why the key store has its own repo

A single restic repo with normal retention keeps every old copy of the key store, and with it every
key forgetting deleted. In the deploy spike, an item forgotten between 2 backup runs came back in
full from the older snapshot of one combined repo. With the key store in its own repo that keeps one
snapshot and prunes every unused byte, the same restore left the item unreadable, while older
database snapshots still restored with the current key store. The key repo therefore holds one
snapshot after every run.

Forgetting reaches the live key store at once. nixie deletes the key with SQLite's `secure_delete`
on and checkpoints the write-ahead log, and the spike found no byte of the deleted wrapped key left
in the key store's files.

### Forget-triggered key cleanup

This section covers the full contract for concurrent key publishers. The first build runs one backup
job at a time and meets the same completion rule in a simpler form, as the
[first build](./deployment.md#first-build) describes.

A durable forget operation forces key-backup work rather than waiting for the periodic schedule.
Key-store mutation and key-repo publication obey the shared generation barrier from
[the memory contract](../memory/store.md#forget-completion-and-key-backups). A publisher cannot
upload a pre-forget staging copy after that barrier. The operation records its generation,
registered backend and acknowledged snapshot IDs, with a stable operation ID for recovery.

The job uploads and verifies a fresh key snapshot that excludes the deleted keys, keeps that
explicit ID, forgets all other key snapshots and prunes their unused data. It checks remaining
repository data and restores every surviving key snapshot against an older data snapshot to confirm
the targets remain unreadable. It removes staging files, restored key samples and recoverable backup
cache copies before it records the backend receipt.

The [key-backup spike](../../../spikes/forget-backups/) tests restic 0.19.1 on a disposable local
filesystem repository. Default `--keep-last 1` retained old key snapshots in separate host groups.
Removing those snapshots without prune left a blob that still decrypted the forgotten item. Explicit
fresh-snapshot retention plus prune cleared that blob; the neighbour still restored. This validates
the local snapshot cleanup path, not a cloud backend or its historical object cleanup.

Errors, failed prune, unavailable backends and crashes keep the forget pending. Recovery resumes the
same operation; it does not restore an old key to reverse a partial deletion. Completion waits for
receipts from all registered key copies plus local checkpoint, index and session cleanup. Key-repo
credentials must allow cleanup, and backend versioning or immutable retention must not leave
unmanaged recoverable copies. A backend that cannot meet that condition cannot report a completed
forget.

The key repo is for restoring a lost host, never for rolling back an upgrade. The earlier deploy
spike showed that restoring a pre-forget key copy brought an item back; keeping the live key store
did not. Backend-specific fault and deletion tests remain required before real use.

The agreed Litestream replica follows the database only. Litestream 0.5 keeps snapshots and their
changes for 24 hours by default, so a replica of the key store would keep a deleted key for a day,
and it has no client-side encryption ([Litestream config](https://litestream.io/reference/config/)).
The replica targets the S3-compatible backend that the deployment configures. Its selected rclone
crypt gateway and matching-key recovery path need cloud validation before use; scheduled key backups
alone do not give fresh encrypted content the data replica's recovery window. With the proposed
hourly key snapshots, new encrypted items can still lose up to an hour after host loss.
Generation-triggered, debounced key publication is a candidate. The
[paired recovery spike](../../../spikes/paired-recovery/) restores new content from a real
continuous encrypted replica once the matching Restic key snapshot exists, and keeps forgotten
content unreadable with post-forget keys. Its small local key publications took about 700 ms each,
excluding initialization and snapshot copying. The debounce scheduler, concurrent publication
barrier, cloud behavior and production recovery window remain untested; the spike adopts no cadence
or mechanism.

The deployment supplies storage settings to Restic and rclone's existing backends. The shared S3
backend uses the configured endpoint, bucket, region and credentials, with compatibility flags where
required. Provider-specific object versioning or retention settings must not leave unmanaged
recoverable key copies; the platform's completion contract stays the same for every backend.

The host runs rclone's crypt remote as the replica's local S3 endpoint. Its password and any custom
salt live in the deployment's encrypted secrets, so the owner's recovery key can recover them after
host loss. A Litestream restore needs that crypt configuration as well as the remote objects;
server-side encryption is not a replacement for this layer.

## Restoring on a new host

A restore needs 3 things the host's loss does not take: the restic repos, the deployment repo and
the owner's recovery key. On a host that meets [the host's needs](./deployment.md#the-host):

1. Clone the deployment repo, and put the recovery key where the Compose file expects the host key.
2. Restore the newest database snapshot and the key store snapshot:

   ```bash
   docker compose run --rm --no-deps nixie restore data latest /data
   docker compose run --rm --no-deps nixie restore keys latest /data
   ```

3. Start nixie with `docker compose up -d --wait`. Expect the client and control plane to become
   ready once impd answers, with recovered work held for owner review.
4. Make a new host key, add it with `sops updatekeys`, commit, and put the recovery key away again.

In the deploy spike, the clean host restored both repos, started healthy with an intact database,
read every item it held, and kept the forgotten item unreadable, from the restic repos and the
recovery key alone. Restore and start took 8.6 s on a small database.

A restored database is older than the lost host by up to one backup interval, so the outside world
moved on after its last record: an action may have run, or an email may have arrived, after the
backup. The restore command therefore installs the durable
[recovery holds](../core/tasks.md#recovery-holds) before startup, then runs crash recovery without
clearing them. Task claims, autonomous launches and new outside-action attempts remain held until
the corresponding checked owner resume or re-enable. The client shows the time the backup was taken
and the tasks that were running then, and the owner resumes each task. **Why:** a task resumed at
once would repeat its last uncommitted step, which may hold an outside action that ran after the
backup, and only the owner can check the outside world.

## The restore check

Once a month by default, nixie restores the newest snapshot of each repo into a scratch directory,
runs SQLite's integrity check, decrypts a sample of memory items with the restored key store, and
records the result. A failed check sends a push notice. **Why:** a backup that never restored is
untested, and the check runs where the owner's restore would.
