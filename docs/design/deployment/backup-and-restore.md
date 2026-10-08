# Backup and restore

- Status: Proposed
- Decisions: [0010](../../decisions/0010-memory-store.md),
  [0020](../../decisions/0020-deployment.md), [0025](../../decisions/0025-database-and-topology.md)

nixie backs up its SQLite database and its key store every hour by default, with `VACUUM INTO`
copies sent to 2 restic repos that hold only ciphertext. The database goes to a repo with long
retention. The key store goes to its own repo, which keeps one snapshot, so a key that forgetting
deletes leaves every backup at the next run, as crypto-shredding under
[0010](../../decisions/0010-memory-store.md) requires. A new host restores from the 2 repos, the
deployment repo and the owner's recovery key. Everything in this doc beyond the decisions it links
is a proposal, and the backup tool itself is a
[decision for the owner](./deployment.md#decisions-for-the-owner).

The [deploy spike](../../../spikes/deploy-local/README.md) ran every step here on local containers,
and the [event log spike](../../../spikes/event-log-db/README.md) measured `VACUUM INTO` at scale.

## What a backup holds

| Store             | Holds                                                       | Backed up                     |
| ----------------- | ----------------------------------------------------------- | ----------------------------- |
| `nixie.db`        | The event log, task state, memory and credential ciphertext | The data repo, long retention |
| `keys.db`         | Every per-item, per-record and per-contact key, wrapped     | The key repo, newest only     |
| SDK session store | The SDK transcript per session                              | Depends on a deferred choice  |
| Deployment repo   | The Compose file, the pin and the sops file                 | Its own git host              |
| Definitions repo  | Persona, jobs and the policy seed                           | Its own git host              |
| Host key          | The age key that decrypts the sops file on this host        | Never                         |

The key store holds the keys that the
[event log design](../core/event-log.md#erasable-fields-and-keys) places apart from the database,
each wrapped by the deployment key. The host key is never backed up: the owner's recovery key is a
second recipient of the sops file and takes its place on a new host.

The SDK keeps its transcript under `CLAUDE_CONFIG_DIR`, inside the imp that runs the turn. The
[deferred decision on the SDK transcript](../open-items.md#deferred-decisions) sets how backups
treat it. If the transcript is a store the owner reads, nixie keeps it on the host through the SDK's
session store and backs it up with the database. If the event log supersedes it, nixie rebuilds a
lost session from the log and leaves it out of backups. Either way, the transcript leaves the imp,
because a worker imp is destroyed after each run and the conversation imp is recreated on each
upgrade.

## A backup run

A backup run takes 4 steps:

1. nixie copies `nixie.db` and `keys.db` with `VACUUM INTO` into a staging directory on the data
   volume, while writers continue.
2. restic backs up the database copy to the data repo, and the key store copy to the key repo.
3. restic forgets old snapshots by each repo's retention, and prunes the key repo with
   `--max-unused 0`, so no byte of a deleted key survives in a pack.
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

Every value in the table is a setting the owner can change. **Why:** an hour bounds both the writes
lost with a failed disk and the time a forgotten item stays recoverable from the key repo, and a
backup run costs seconds.

A failed run sends the owner a push notice, and the health endpoint reports backups unready once the
last success is older than twice the interval, as
[deployment](./deployment.md#health-and-monitoring) describes.

nixie runs `restic` itself, with the repo password from the deployment's secrets in the child
process's environment only. A repo lives on any restic backend the owner picks, such as SFTP to
another machine or bucket storage, and holds only ciphertext with names and structure hidden
([storage notes](../../research/2.4-notes/data-and-storage.md#backups)).

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

Forgetting reaches the backups within one backup interval. A restore of the key repo taken before
the forget brings the item back, so nixie restores the key repo only to rebuild a lost host, and
never to roll back an upgrade. The spike showed the case: a rollback that restored a key store copy
from before a forget brought the forgotten item back, and one that kept the live key store did not.

A Litestream replica, if the owner chooses one, follows the database only. Litestream 0.5 keeps
snapshots and their changes for 24 hours by default, so a replica of the key store would keep a
deleted key for a day, and it has no client-side encryption
([Litestream config](https://litestream.io/reference/config/)).

## Restoring on a new host

A restore needs 3 things the host's loss does not take: the restic repos, the deployment repo and
the owner's recovery key. On a host that meets [the host's needs](./deployment.md#the-host):

1. Clone the deployment repo, and put the recovery key where the Compose file expects the host key.
2. Restore the newest database snapshot and the key store snapshot:

   ```bash
   docker compose run --rm --no-deps nixie restore data latest /data
   docker compose run --rm --no-deps nixie restore keys latest /data
   ```

3. Start nixie with `docker compose up -d --wait`. Expect every part of the readiness list to turn
   ready once impd answers.
4. Make a new host key, add it with `sops updatekeys`, commit, and put the recovery key away again.

In the deploy spike, the clean host restored both repos, started healthy with an intact database,
read every item it held, and kept the forgotten item unreadable, from the restic repos and the
recovery key alone. Restore and start took 8.6 s on a small database.

A restored database is older than the lost host by up to one backup interval, so the outside world
moved on after its last record: an action may have run, or an email may have arrived, after the
backup. nixie therefore starts a restored database with every task paused, and runs the
[crash recovery](../core/tasks.md#crash-recovery) steps first. The client shows the time the backup
was taken and the tasks that were running then, and the owner resumes each task. **Why:** a task
resumed at once would repeat its last uncommitted step, which may hold an outside action that ran
after the backup, and only the owner can check the outside world.

## The restore check

Once a month by default, nixie restores the newest snapshot of each repo into a scratch directory,
runs SQLite's integrity check, decrypts a sample of memory items with the restored key store, and
records the result. A failed check sends a push notice. **Why:** a backup that never restored is
untested, and the check runs where the owner's restore would.
