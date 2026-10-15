# 0032: Offsite backups and replication

- Date: 2026-10-10
- Updated: 2026-10-15
- Status: decided
- Design: [backup and restore](../design/platform/deployment/backup-and-restore.md),
  [deployment](../design/platform/deployment/deployment.md)
- Research: [replica encryption spike](../design/platform/spikes/replica-encryption/),
  [paired recovery spike](../design/platform/spikes/paired-recovery/),
  [forget backups spike](../design/platform/spikes/forget-backups/)

Restic holds scheduled encrypted snapshots of the data store and the wrapped key store, in separate
repositories. Litestream replicates the data database offsite to S3-compatible storage, and never
the key store. The deployment picks the S3-compatible backend through configuration, under
[0020](0020-deployment.md), and the platform adopts no cloud provider. Restic and rclone supply the
storage backends.

Offsite copies sit on provider storage only as ciphertext. The host runs rclone as a local S3
gateway over a crypt remote: Litestream sends replica objects to the gateway, and rclone encrypts
their contents and names before upload. Readable personal data stays on the host.

A forget stays pending until its deleted keys leave every registered backup, under
[0010](0010-memory-store.md).

nixie owns the backup guarantees: encryption on the host, data that restores with matching keys, and
removal of every registered key copy before a forget completes. Restic, Litestream and rclone are
the chosen implementation, and any replacement keeps those guarantees.

## The first build

The first build runs hourly Restic snapshots of the data and key stores on one Compose host. A
forget there reports pending until the key repository prunes every older snapshot. The Litestream
replica through the rclone gateway follows once data and keys restore together.

## The recovery bound

Once the replica ships, a restore after total host loss loses at most 5 minutes of encrypted
content. A key change triggers a key snapshot once 60 seconds pass with no further key change, and
never later than 5 minutes after the first unpublished key change. The hourly key snapshot stays as
a fallback. The bound counts until the key snapshot is published, so nixie sends a push when a key
change stays unpublished for more than 5 minutes, such as behind a slow upload. Until the replica
ships, the data snapshot runs hourly, so the bound stays 1 hour.

## Why

- Restic keeps encrypted history, and Litestream protects recent changes from losing the whole host.
- Litestream has no client-side encryption, and nixie's item encryption leaves database pages
  readable, so the replica needs encryption on the host. Server-side encryption would hand the
  provider readable pages.
- Replicating the key store would keep deleted keys in its history, which defeats forget.
- Using the tools' own backends keeps the platform free of provider-specific code.
- The replica keeps the data within seconds of the host, so the key snapshot sets the real recovery
  bound: new content restores only with the key that encrypts it.
- A wait for 60 quiet seconds turns a burst of new memories into one key snapshot.
- 5 minutes of loss after total host loss is acceptable for a personal assistant, and a restore
  holds running tasks for your review whatever the bound.
- The paired recovery spike published a key snapshot in about 0.7 s on a local backend.
  [GEO-273](https://linear.app/zgeoff/issue/GEO-273) times it on a real backend.

## Alternatives

- **Restic alone.** It is simpler, and an hourly cadence can lose up to an hour of writes after
  total disk loss.
- **A replica on another local disk.** It recovers recent changes, and loses them with the host.
- **Kopia.** It is an alternative encrypted snapshot tool, untested here.
- **A local replica with a separate encrypted uploader.** It avoids the gateway, and adds upload
  scheduling and consistency work.
- **A recovery bound of 1 minute.** Key snapshots then run almost constantly, with more backend
  requests and more prune work.
- **A recovery bound of 15 minutes.** It takes fewer snapshots, and loses more content.
- **A recovery bound of 1 hour, from the hourly schedule alone.** The replica then gains nothing,
  because new content has no key to restore it with.

## Consequences

- The replica adds a service, cloud requests and an experimental encryption gateway.
- S3 compatibility alone does not prove that a backend meets the forget contract, so each backend's
  versioning, retention and deletion need checking.

## Changes

- 2026-10-11: a key change triggers its own key snapshot, so a restore after total host loss loses
  at most 5 minutes once the replica ships. The first version took key snapshots only on the hourly
  schedule.
- 2026-10-15: record 0044, The recovery bound, merged into this record.
