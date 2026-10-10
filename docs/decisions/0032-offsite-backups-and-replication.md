# 0032: Offsite backups and replication

- Date: 2026-10-10
- Status: decided
- Design: [backup and restore](../design/deployment/backup-and-restore.md),
  [deployment](../design/deployment/deployment.md)
- Research: [replica encryption spike](../../spikes/replica-encryption/),
  [paired recovery spike](../../spikes/paired-recovery/),
  [forget backups spike](../../spikes/forget-backups/)

Restic holds scheduled encrypted snapshots of the data store and the wrapped key store, in separate
repositories. Litestream replicates the data database offsite to S3-compatible storage, and never
the key store. The deployment picks the S3-compatible backend through configuration, under
[0020](./0020-deployment.md), and the platform adopts no cloud provider. Restic and rclone supply
the storage backends.

Offsite copies sit on provider storage only as ciphertext. The host runs rclone as a local S3
gateway over a crypt remote: Litestream sends replica objects to the gateway, and rclone encrypts
their contents and names before upload. Readable personal data stays on the host.

A forget stays pending until its deleted keys leave every registered backup, under
[0010](./0010-memory-store.md).

nixie owns the backup guarantees: encryption on the host, data that restores with matching keys, and
removal of every registered key copy before a forget completes. Restic, Litestream and rclone are
the chosen implementation, and any replacement keeps those guarantees.

## The first build

The first build runs hourly Restic snapshots of the data and key stores on one Compose host. A
forget there reports pending until the key repository prunes every older snapshot. The Litestream
replica through the rclone gateway follows once data and keys restore together.

## Why

- Restic keeps encrypted history, and Litestream protects recent changes from losing the whole host.
- Litestream has no client-side encryption, and nixie's item encryption leaves database pages
  readable, so the replica needs encryption on the host. Server-side encryption would hand the
  provider readable pages.
- Replicating the key store would keep deleted keys in its history, which defeats forget.
- Using the tools' own backends keeps the platform free of provider-specific code.

## Alternatives

- **Restic alone.** It is simpler, and an hourly cadence can lose up to an hour of writes after
  total disk loss.
- **A replica on another local disk.** It recovers recent changes, and loses them with the host.
- **Kopia.** It is an alternative encrypted snapshot tool, untested here.
- **A local replica with a separate encrypted uploader.** It avoids the gateway, and adds upload
  scheduling and consistency work.

## Consequences

- The replica adds a service, cloud requests and an experimental encryption gateway.
- S3 compatibility alone does not prove that a backend meets the forget contract, so each backend's
  versioning, retention and deletion need checking.
