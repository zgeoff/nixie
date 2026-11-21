# 0017: The backup job counts publishes in the repositories' snapshot tags

- Date: 2026-11-21
- Status: decided

## Decision

Each publish of a backup set takes a publish number, which the backup job counts from the `publish-`
tags in the key and data repositories. The job tags both snapshots of the publish with it, and tags
the key snapshot with the publish numbers that the
[pick](../architecture/deployment/backup-pair.md#the-pick) reads. nixie's database, the set's
manifest and its receipt hold no publish number.

## Why

- Only the backup job can list the repositories, because it alone holds their credentials, as
  [0013](0013-host-encrypted-backups.md) records. A count kept with the snapshots is one the fetch
  can read on a new host, where nixie's database is gone.
- A tag needs no migration, no new record kind, and no new version of the manifest or the receipt,
  which both programs read.
- nixie's set sequence can repeat after a restore, so a `set-` number alone cannot tell 2 publishes
  apart.

## Rejected alternatives

| Option                                                   | Why not                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| a publish number in the manifest or the receipt          | nixie would have to count publishes, from a database that a restore replaces, and both shared formats would need a new version |
| a publish number in nixie's set table, with a new record | a migration and a record kind for a number that only the fetch reads, from a database it never opens                           |
| the operator picks the 2 snapshots by hand               | only a command that sees both lists can refuse a data copy whose records the key copy cannot read                              |

## Consequences

- Snapshots written before publish numbers have none, so the pick keeps rules for unnumbered
  snapshots, which it reads by their `set-` number and restic's time.
- A change to a tag's meaning is a change to a stored format: every release reads the tags that
  earlier releases wrote.
