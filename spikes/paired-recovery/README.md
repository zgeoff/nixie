# Paired data and key recovery

## Question

Does a continuous encrypted Litestream replica restore new content when paired with a newly
published Restic key snapshot, and does a post-forget key snapshot keep old ciphertext unreadable?

[0032](../../docs/decisions/0032-offsite-backups-and-replication.md) selects Restic snapshots and a
database-only Litestream replica through a host rclone crypt gateway. The
[replica encryption spike](../replica-encryption/) checks the data path, and the key-backup spike in
the memory design checks Restic cleanup. This run combines the two selected tools with separate data
and key stores.

## Run

Use Bun and the official Litestream 0.5.17, rclone 1.75.2 and Restic 0.19.1 binaries. The runner
checks those version strings. The binaries remain outside the package.

```bash
bun install --ignore-scripts
NIXIE_LITESTREAM_BIN=<litestream_binary_path> NIXIE_RCLONE_BIN=<rclone_binary_path> NIXIE_RESTIC_BIN=<restic_binary_path> bun run check
```

[run.ts](./run.ts) creates disposable SQLite stores, a local Restic key repository and encrypted
local replica objects behind an authenticated loopback S3 gateway. [store.ts](./store.ts) uses
synthetic AES-GCM content and AES-KW wrapped keys, not nixie's production cipher format. All secrets
and the wrapping-key recovery input are public fixtures. [process.ts](./process.ts) passes only
PATH, a temporary rclone cache location and the fixture Restic password to its children. It stops
every child and removes the temporary files after the run. It calls no model or cloud API.

Key snapshots enter Restic through stdin with the fixed filename `keys.db`; recovery dumps that
exact file. This avoids restoring unrelated host paths and ownership metadata. Key samples and
staging copies leave before the final restore check.

## Result

The local run passes 8 checks:

- The continuous encrypted replica restores the older fact with an older key snapshot; the same
  snapshot cannot read a new fact.
- A key snapshot from the new generation makes that same replicated new fact readable, and new key
  allocation advances the generation.
- A pre-forget generation is stale after key deletion.
- Explicit fresh-snapshot retention, prune and a read-data check leave only the post-forget key
  snapshot.
- After removal of the original live data/key stores, the replica plus current key snapshot restores
  the new fact and leaves the forgotten fact unreadable.

Three key publications took 694 ms, 702 ms and 701 ms in this small local fixture, excluding
repository initialization and snapshot copy time. These timings show that a publication on each
changed key generation is a viable candidate for measurement, not a production recovery bound or a
selected debounce interval. The host still needs a scheduler, durable recovery receipts and the
publication/forget barrier from the design.

## Limits

The test uses no actual S3 or R2 service, owner secrets, inference model or sops recovery.
Key-generation comparisons are sequential controls: the run tests no concurrent publisher or
debounce scheduler, upload interrupted in flight, multipart behavior or physical power loss. It does
not prove complete erasure of every possible backend version or repository copy. The earlier
key-backup spike covers specific stale-blob controls; this run checks the combined restore path.

Data and key commits occur in separate fixture databases; this is not proof of a production write
transaction or all crash boundaries. The deployment-configured backend still needs paired recovery,
retention and deletion validation before use. No key-recovery cadence or mechanism is adopted by
this spike alone.
