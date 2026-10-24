# Spike: replica encryption

This spike replicates SQLite with Litestream through a host-local rclone S3 gateway over a crypt
remote, the host-side encryption that
[0032](../../docs/decisions/0032-offsite-backups-and-replication.md) chose. It checks restores after
process outages and a recovery without the original database, for the gateway in the
[backup and restore design](../../docs/design/platform/deployment/backup-and-restore.md).

## Question

Can Litestream 0.5.17 replicate SQLite through a host-local rclone 1.75.2 S3 gateway over a crypt
remote, restore after process outages and recover without the original database?

## Answer

- The local run passes all 7 checks.
- After a `SIGKILL` of the gateway or of Litestream, a restart catches up the write committed during
  the outage.
- Fresh configuration restores all 4 records after removal of the original database, WAL, shadow
  state, crypt configuration and cache, given the encryption password.
- Every backing object has a crypt header and contains none of the 4 plaintext markers.

The run supports the selected gateway, and a cloud deployment needs a backend test before it relies
on this path.

## Run it

```bash
bun install --ignore-scripts
NIXIE_LITESTREAM_BIN=<litestream_binary_path> NIXIE_RCLONE_BIN=<rclone_binary_path> bun run check
```

The [setup](results.md#setup) gives the binaries to download and what the runner sets up.

## Results

The [results](results.md) hold each check and what the run supports.

## Untested

A cloud backing store, a forced upload in flight, and any latency or cost bound. The
[untested list](results.md#untested) gives the rest.
