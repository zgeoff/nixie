# 0017: The backup job numbers each publish in the repositories' snapshot tags

- Date: 2026-11-21
- Status: decided

## Decision

A restore on a new host needs a key snapshot and a data snapshot that belong together, so that the
key snapshot can decrypt every record in the data snapshot.
[Backups](../architecture/deployment/backups.md) describes the 2 restic repositories, one for keys
and one for data, and the backup job that publishes each set nixie stages to both.

To tie the 2 snapshots of a publish together, the backup job gives each publish a number: one above
the highest `publish-` tag in either repository. It tags both snapshots with that number. It also
tags each key snapshot with the lowest publish number of a data snapshot that the key snapshot can
decrypt. `nixie-backup fetch` reads those tags to pick the pair, as
[the backup pair](../architecture/deployment/backup-pair.md) describes. nixie's database, and the
manifest and receipt of each set, hold no publish number.

## Why

- Only the backup job holds the repositories' credentials, as
  [0013: host-encrypted backups](0013-host-encrypted-backups.md) records. `nixie-backup fetch` runs
  on a new host, where nixie's database is gone, so the number has to sit with the snapshots it
  reads.
- A tag needs no migration, no new record kind, and no new version of the manifest or the receipt,
  which nixie and the backup job both read.
- A restore takes nixie's set sequence back, so a set number alone cannot tell 2 publishes apart.

## Rejected alternatives

| Option                                                   | Why not                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| a publish number in each set's manifest or receipt       | nixie would count publishes from a database that a restore replaces, and both shared formats would need a new version          |
| a publish number in nixie's set table, with a new record | a migration and a record kind for a number that only `nixie-backup fetch` reads, and that command never opens nixie's database |
| the operator picks the 2 snapshots by hand               | only a command that lists both repositories can refuse a data snapshot that the newest key snapshot cannot decrypt             |

## Consequences

- The repositories hold snapshots with no `publish-` tag, which releases before publish numbers
  wrote. The fetch orders those snapshots by their set number and their restic timestamp.
- A change to a tag's meaning is a change to a stored format, because every release reads the tags
  that earlier releases wrote.
