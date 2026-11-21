# 0017: The backup job numbers each publish in the repositories' snapshot tags

- Date: 2026-11-21
- Status: decided

## Decision

A restore on a new host needs a key snapshot and a data snapshot that belong together, so that the
key snapshot can decrypt every record in the data snapshot.
[Backups](../architecture/deployment/backups.md) describes the parts: nixie stages a set, a copy of
its 2 databases, and the backup job publishes each set to 2 restic repositories, one for keys and
one for data.

The backup job numbers each publish one above the highest `publish-<n>` tag in either repository,
and tags both snapshots of the publish with that number. Each key snapshot also carries a
`proven-from-<n>` tag: the lowest publish number of a data snapshot that the key snapshot can
decrypt. `nixie-backup fetch` matches a data snapshot to the newest key snapshot by these tags, and
refuses one below that limit, as [the backup pair](../architecture/deployment/backup-pair.md)
describes. nixie's database, and each set's manifest and receipt, hold no publish number.

## Why

- Only the backup job holds the repositories' credentials, as
  [0013: host-encrypted backups](0013-host-encrypted-backups.md) records. `nixie-backup fetch` runs
  on a new host, where nixie's database is gone, so the fetch reads the numbers from the snapshots
  themselves.
- A tag needs no migration, no new record kind, and no new version of the manifest or the receipt,
  which nixie and the backup job both read.
- A restore rolls nixie's set sequence back to the restored data, so nixie can stage a set number
  that the data repository already holds. A set number alone therefore cannot tell 2 publishes
  apart.

## Rejected alternatives

| Option                                                   | Why not                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| a publish number in each set's manifest or receipt       | nixie would count publishes from a database that a restore replaces, and both shared formats would need a new version                         |
| a publish number in nixie's set table, with a new record | a migration and a record kind for a number that only `nixie-backup fetch` reads, and that command never opens nixie's database                |
| the operator picks the 2 snapshots by hand               | a listing shows times and set numbers, which cannot show which key snapshot decrypts which data snapshot after a restore or a stopped publish |

## Consequences

- A backup job of a release that does not number its publishes writes snapshots with no `publish-`
  tag. The fetch orders those snapshots by their `set-<n>` tag and restic's timestamp.
- A change to a tag's meaning is a change to a stored format, because every release reads the tags
  that earlier releases wrote.
