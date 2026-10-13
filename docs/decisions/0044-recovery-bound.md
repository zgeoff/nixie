# 0044: The recovery bound

- Date: 2026-10-11
- Status: decided
- Design: [backup and restore](../design/platform/deployment/backup-and-restore.md)
- Research: [paired recovery spike](../design/platform/spikes/paired-recovery/)

Once the offsite replica from [0032](0032-offsite-backups-and-replication.md) ships, a restore after
total host loss loses at most 5 minutes of encrypted content. A key change triggers a key snapshot
once 60 seconds pass with no further key change, and never later than 5 minutes after the first
unpublished key change. The hourly key snapshot stays as a fallback. The bound counts until the key
snapshot is published, so nixie sends a push when a key change stays unpublished for more than 5
minutes, such as behind a slow upload.

Until the replica ships, the data snapshot runs hourly, so the bound stays 1 hour.

## Why

- The replica keeps the data within seconds of the host, so the key snapshot sets the real bound:
  new content restores only with the key that encrypts it.
- A wait for 60 quiet seconds turns a burst of new memories into one snapshot.
- 5 minutes of loss after total host loss is acceptable for a personal assistant, and a restore
  holds running tasks for your review whatever the bound.
- The paired recovery spike published a key snapshot in about 0.7 s on a local backend.
  [GEO-273](https://linear.app/zgeoff/issue/GEO-273) times it on a real backend.

## Alternatives

- **1 minute.** Key snapshots then run almost constantly, with more backend requests and more prune
  work.
- **15 minutes.** It takes fewer snapshots, and loses more content.
- **1 hour, from the hourly schedule alone.** The replica then gains nothing, because new content
  has no key to restore it with.
- **Replicate the key store with the data.** [0032](0032-offsite-backups-and-replication.md) rejects
  it: the replica's history keeps deleted keys, which defeats forget.
