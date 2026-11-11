# The backup job's publish numbers and the fetch

A lost host restores from 2 restic repositories: the data repository, which holds copies of
`nixie.db`, and the key repository, which holds copies of `keys.db`. The backup job is the program
`nixie-backup` in the backup image, and it alone holds the repositories' credentials. It numbers
each publish in the repositories, and one command of it fetches a data copy and a key copy that
belong together. The fetch refuses a data copy that holds records whose keys the key copy lacks.

The section "Built" gives what the code does. Every section after it gives the designed system,
which differs from the code in the publish order, the tags and the commands. The sketches in
`sketches/operations/` hold the shapes, and this doc holds the rules. A place marked
`(open: <name>)` is not settled: see [the open list](open/operations.md), which links the issue.
Other terms are in the [glossary](../../glossary.md). [Backup and recovery](backup-and-recovery.md)
holds what `nixie restore` does with the fetched directory.

Terms of this doc:

- A **backup set** is one `nixie.db` copy and one `keys.db` copy that nixie stages together in one
  folder of the staging folder. Its **sequence** is the number that nixie gives it, which is also
  the folder's 12-digit name.
- A **manifest** is the file that nixie writes into a backup set's folder, and a **receipt** is the
  file that the backup job writes there after a publish, with the publish's result.
- A **job pass** is one pass of the backup job over the staging folder, which publishes each staged
  backup set.
- A **data snapshot** and a **key snapshot** are the 2 restic snapshots that one publish writes.
- A **publish number** is the positive integer that one publish gives both of its snapshots.
- A key copy **vouches for** a data snapshot when it holds the key of every record in that data
  snapshot, except the records of an item that you [forgot](../../glossary.md).
- A **backup pair** is the key snapshot and the data snapshot that the fetch picks.

## Built

- The backup image has 2 commands, `run` and `loop`. A deployment restores through a script of its
  own beside the image.
- The backup job reaches restic through `ResticClient`, which `buildResticClient` builds.
  `runRestic` reads the output of the restic process as text.
- `publishBackupSet` tags both snapshots of a backup set `set-<sequence>` and `kind-<kind>`. It
  writes the data snapshot first and the key snapshot second. After it writes the key snapshot, it
  removes every other key snapshot, prunes and checks. When the key snapshot fails, it removes none.
- `writeSnapshotSet` picks the sequence of a backup set: one more than the highest sequence in
  nixie's set table and among the staged folders. After a restore the table is the restored one, so
  a sequence can repeat a number that the repositories hold.
- The manifest and the receipt are strict objects at format 1.
- The backup job and nixie skip a name in the staging folder that is not 12 digits.
- `nixie backup --to <directory>` writes the unfinished-backup marker `backup-incomplete` before the
  first copy and removes it after the last. The log module owns the marker's name.
- `nixie restore --from <directory> --yes` reads a local directory. `restoreDataBackup` refuses a
  directory that holds the unfinished-backup marker.
- nixie holds no backup credential, by
  [decision 0020](../../decisions/0020-deployment.md#the-backup-job).

## The repository interface

[The repository interface](sketches/operations/02-types.ts), section B, holds the shape.

- The fetch and the publish reach a repository through one interface, with a restic adapter behind
  it. [Decision 0032](../../decisions/0032-offsite-backups-and-replication.md) chooses restic and
  lists an alternative, and the interface is where an alternative fits.
- One method lists the snapshots of a repository with their tags and times.
- One method restores a snapshot into a directory. It writes bytes to a file, because text damages a
  database file.
- The names of the 2 methods are not settled (open: repository method names).
- [The rules for any port](port-rules.md) apply to the interface.

## Tags

[The tag type](sketches/operations/02-types.ts), section A, holds the shape.

- One function of the backup job formats every tag, and one parses them. When a tag does not parse,
  the fetch treats the snapshot as one without that tag.
- `set-<sequence>` and `kind-<kind>` are on both snapshots. `set-<sequence>` is for you to read. The
  fetch reads the `set-` number only of a snapshot with no publish number.
- `publish-<n>` is on both snapshots. The fetch orders key snapshots by it, and matches a data
  snapshot to its key snapshot by it.
- Each publish writes a key snapshot that replaces the one before it. `legacy-set-<sequence>` is on
  every key snapshot from the first one with a publish number. That first one takes the tag with the
  `set-` number of the key snapshot that it replaces, and each one after copies the tag.
- `proven-from-<n>` is on a key snapshot only after one of the 2 exceptions of the publish. It means
  that the key copy vouches for no data snapshot below publish `n`, and for none without a publish
  number. A key snapshot copies the tag from the key snapshot it replaces.
- The publish number identifies one publish of a backup set (open: set identity).

## The publish

[The publish of one backup set](sketches/operations/03-flow.ts), section A, holds the flow.

- `publishBackupSet` runs under the backup job's staging lock.
- The publish number is one more than the highest publish number in either repository. With no
  publish number in either, it is 1.
- When the backup job cannot list the data repository, it counts from the key repository alone. When
  it cannot list the data repository and the key repository holds no publish number, it writes a
  failed receipt and no snapshot. So a publish number never repeats.
- The publish writes the key snapshot first, so it never writes a data snapshot with a publish
  number whose key snapshot was not written. When the key snapshot fails, the publish writes no data
  snapshot.
- The key snapshot copies `legacy-set-` and `proven-from-` from the key snapshot it replaces, with 2
  exceptions. In both, it takes `proven-from-<n>` with its own number:
  - Staging holds a [restore note](backup-and-recovery.md#the-restore) with no key snapshot ID, or
    with an ID other than that of the newest key snapshot in the repository. The publish then cannot
    tell that the restored key copy is the repository's newest. The key snapshot that the publish
    writes also takes no `legacy-set-` tag.
  - The key snapshot it replaces has no publish number, and either repository holds a snapshot with
    one. The replaced snapshot then carries neither tag to copy.
- The data snapshot carries the same `set-`, `kind-` and `publish-` tags. After it, the publish
  applies the data repository's retention through `runRetention`.
- Only when the publish wrote its own key snapshot does it remove every other key snapshot, prune
  and check. It does so whether the data snapshot passed or failed.
- The publish removes the restore note and then writes the receipt. The receipt is at format 1.
- nixie's set table holds no publish number, and `writeSnapshotSet` picks one more than the highest
  sequence it finds. So `set-<sequence>` can repeat in the data repository after a restore.

## The pick

[Published snapshots and the pick](sketches/operations/02-types.ts), section C, holds the types.
[The newest key snapshot](sketches/operations/03-flow.ts), section B, and
[the pair](sketches/operations/03-flow.ts), section C, hold the flow.

- `pickNewestKey` and `pickBackupPair` are pure functions over the 2 snapshot lists.
- A pick ends in a relation or a refusal. The relations are `same-publish` and `older-data`: the
  fetch takes the pair. Every other result is a refusal, and the fetch takes nothing.
- The key repository can hold 2 key snapshots when a publish stopped before it forgot the one it
  replaced. To find the newest, the pick first drops a key snapshot with no publish number when
  another key snapshot holds its `set-` number in `legacy-set-`. If every key snapshot that remains
  has a publish number, the pick takes the highest number. Otherwise it takes the latest by restic's
  time.
- With no key snapshot, the pick refuses with `no-key-snapshot`.
- The default data snapshot is the one with the key snapshot's publish number. With none, the pick
  refuses with `no-data-of-publish`, and the message holds the ID of the data snapshot with the
  highest publish number that the key copy vouches for. With more than one, it refuses with
  `duplicate-publish`.
- For a key snapshot with no publish number, the default data snapshot is the latest one by restic's
  time that has no publish number and the same `set-` number. These 2 cases are the only ones that
  read a clock.
- When you name a data snapshot that the data repository does not hold, the pick refuses with
  `no-such-data-snapshot`. For one it holds, the table gives the result:

| Key snapshot      | Named data snapshot | Condition                                                        | Result                 |
| ----------------- | ------------------- | ---------------------------------------------------------------- | ---------------------- |
| publish number    | publish number      | the same publish number                                          | `same-publish`         |
| publish number    | publish number      | a higher publish number                                          | `data-newer-than-keys` |
| publish number    | publish number      | a lower publish number, below `proven-from`                      | `data-unproven`        |
| publish number    | publish number      | a lower publish number, otherwise                                | `older-data`           |
| publish number    | no publish number   | `set-` at or below `legacy-set`, and no `proven-from` on the key | `older-data`           |
| publish number    | no publish number   | otherwise                                                        | `data-unproven`        |
| no publish number | no publish number   | the same `set-` number                                           | `same-publish`         |
| no publish number | no publish number   | a lower `set-` number                                            | `older-data`           |
| no publish number | no publish number   | a higher `set-` number                                           | `data-newer-than-keys` |
| no publish number | publish number      | any                                                              | `data-unproven`        |

- In the last row the key snapshot carries no `proven-from-` tag, so the fetch cannot tell which
  data snapshots the key copy vouches for.
- For `older-data`, the fetch guarantees that a record with no key in the backup pair belongs to an
  item that you forgot (open: older-data guarantee).
- A `set-` number repeats after a restore. So while the newest key snapshot has no publish number,
  the row "a lower `set-` number" can give `older-data` for a data snapshot that the key copy does
  not vouch for. The pick accepts that case (open: named snapshot window). The default fetch is not
  affected.
- The text of each refusal's message is not written (open: refusal texts).

## The fetch command

[A restore from the 2 repositories](sketches/operations/01-usage.ts), section A, shows the commands.
[The fetch](sketches/operations/03-flow.ts), section D, holds the flow.
[The files](sketches/operations/02-types.ts), section D, and
[the log lines](sketches/operations/02-types.ts), section E, hold the shapes.

- `nixie-backup fetch --to <directory> [--data-snapshot <snapshot_id>]` is one command that fetches
  the pair (open: one fetch command). It reads the `NIXIE_BACKUP_*` repository and password
  variables that the backup job reads, and never the staging folder.
- The fetch refuses a `<directory>` that exists and is not empty, and exits 1.
- The fetch writes the unfinished-backup marker before the first copy. Its last write is the file
  `fetched-pair.json`, which records the pair, and then it removes the marker (open: stopped fetch).
  The wire lib owns the marker's name, because both programs write it.
- After it writes both copies, the fetch lists the key repository again. When the newest key
  snapshot is another one, the fetch empties `<directory>` but for the marker and picks again. It
  picks again at most 3 times. A fourth change of the newest key snapshot is a failure of the step
  `pick`.
- A fetch that ends well logs one `backup.fetched` line and exits 0.
- On any failure, the fetch logs `backup.fetch_failed` with the step and the refusal code if there
  is one. The marker remains, the fetch exits 1, and `nixie restore` refuses the directory. Only the
  step name `pick` is settled (open: fetch step names).
- `nixie-backup snapshots` prints each snapshot of both repositories as one JSON line. You read it
  to name a `--data-snapshot`.
- The fetch container holds no deployment key and mounts no data volume. The restore container holds
  no backup credential.
- A deployment calls only commands. A deployment's script never reads a repository's layout or a
  file in the data directory.
- The key repository serves host recovery only. nixie has no command that restores a key copy other
  than the newest, because such a restore makes an item that you forgot readable again.

## When a publish or a fetch stops

- When a publish stops between the key snapshot and the data snapshot, the backup set has no
  receipt, and the next job pass publishes it again under the next number. If the host is lost in
  that window, the default fetch refuses with `no-data-of-publish`, and you name the data snapshot
  whose ID the message holds.
- When a publish stops after it writes its key snapshot and before it removes the replaced one, the
  pick takes the key snapshot with the higher publish number.
- When the first publish with a number stops between those 2 writes, its `legacy-set-` tag holds the
  `set-` number of the replaced key snapshot, so the pick drops the replaced key snapshot.
- When a publish stops after the key snapshot and before it removes the restore note, the next
  publish raises `proven-from` again. The fetch then refuses more data snapshots and never fewer.
- You stop nixie and its backup job before a fetch. If the backup job runs all the same and
  publishes a staged backup set after the fetch ends and before the restore, the fetched key copy is
  not the newest. The restore note then holds the ID of a key snapshot that is not the newest, and
  the next publish sets `proven-from`.
- When a job pass publishes while a fetch runs, the fetch's second list shows it, and the fetch
  picks again.
- A restore from a `nixie backup --to` directory writes a restore note with no key snapshot ID. So
  the next publish sets `proven-from` to its own number, and every data snapshot from before the
  restore is `data-unproven`.
- A backup job of a release without publish numbers writes snapshots with none of the 3 tags
  `publish-`, `legacy-set-` and `proven-from-`. The fetch reads each as a snapshot with no publish
  number: restic's time orders such key snapshots. When such a key snapshot is the newest, a named
  data snapshot with a publish number is `data-unproven`.

## Not in scope

- A field added to the manifest or the receipt. Both are strict objects.
- A record kind, a config key, an environment variable, a migration and a table column.
- A flag on `nixie restore`, `run` or `loop`.
- A tag added to a data snapshot after its key snapshot is written. restic rewrites a retagged
  snapshot under another ID.
- The offsite replica and `nixie rollback`.
- The monthly restore check and the check of a forget against the backups, both of the
  [backup and restore design](../platform/deployment/backup-and-restore.md).
- A guard against a backup job that runs on a host you took for lost and publishes after the
  restore. The first step of the restore runbook, stop nixie and its backup job, is the only guard.
- A step of the restore that finishes the forget of each item whose key the key copy lacks (open:
  forgotten items).
