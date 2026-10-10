# Replica encryption

## Question

Can Litestream 0.5.17 replicate SQLite through a host-local rclone 1.75.2 S3 gateway over a crypt
remote, restore after process outages and recover without the original database?

The owner chose host-side encryption before upload in
[0032](../../docs/decisions/0032-offsite-backups-and-replication.md). The owner chose the rclone
component in the same decision. [rclone serve s3](https://rclone.org/commands/rclone_serve_s3/) is
experimental; [crypt](https://rclone.org/crypt/) encrypts payloads and filenames before they enter
the backing store. Litestream 0.5.x does not support client-side age encryption
([configuration](https://litestream.io/reference/config/#encryption)).

## Run

Use Bun and the official Litestream 0.5.17 and rclone 1.75.2 binaries. Download them from
[Litestream releases](https://github.com/benbjohnson/litestream/releases/tag/v0.5.17) and
[rclone releases](https://github.com/rclone/rclone/releases/tag/v1.75.2), outside the spike
directory. The runner checks both version strings.

```bash
bun install --ignore-scripts
NIXIE_LITESTREAM_BIN=<litestream_binary_path> NIXIE_RCLONE_BIN=<rclone_binary_path> bun run check
```

[run.ts](./run.ts) creates one disposable SQLite database and an encrypted local backing directory.
It exposes the crypt remote through an authenticated S3 gateway bound to loopback, with the VFS
cache disabled. All credentials, encryption passwords and record contents are public fixtures. Child
processes receive only PATH and a temporary rclone cache location, with explicit configuration
paths. The runner stops its processes and removes its temporary files after success or failure. It
calls no model or cloud API.

## Result

The local run passes 7 checks:

- Initial restore and a subsequent WAL update restore exact contents and pass SQLite's integrity
  check.
- A gateway `SIGKILL` makes its endpoint unavailable while local writes and Litestream continue. Its
  restart catches up the write committed during the outage.
- A Litestream `SIGKILL` followed by a local write and a restart catches up that write.
- Fresh configuration restores all 4 records after removal of the original database, WAL, shadow
  state, crypt configuration and cache. The encryption password comes from the fixture recovery
  input.
- Every backing object has a crypt header and contains none of the 4 plaintext markers.

The gateway can recover from these process outages, and restoring requires the encryption password
as well as the remote objects. This supports the selected gateway in the
[deployment design](../../docs/design/deployment/backup-and-restore.md), not cloud validation or a
production recovery bound.

## Limits

The backing store is a local directory, not Amazon S3 or Cloudflare R2. The process kills do not
target a forced upload in flight, and the run tests no multipart uploads, concurrent writers,
provider retention, key-store recovery, forgetting, corrupt objects or physical power loss. The
marker and header checks are not a cryptographic audit. The run measures no latency or bandwidth
bound, and cloud request costs remain unmeasured.

A cloud deployment needs a backend and paired-key restore test, an outage signal, and validation of
interrupted uploads before it relies on this path. The SDK transcript and key store never enter this
replica.
