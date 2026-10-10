# 0035: The backup sidecar

- Date: 2026-10-10
- Status: decided
- Supersedes in part: [0020](0020-deployment.md), on its one secrets file
- Design: [backup and restore](../design/platform/deployment/backup-and-restore.md),
  [deployment](../design/platform/deployment/deployment.md)

nixie's backup tools run in their own container, the backup sidecar, beside nixie: in nixie's pod on
Kubernetes and in nixie's Compose project. restic, Litestream and the rclone crypt gateway live in
the backup image, built and released with nixie's other images. sops stays in the nixie image, and
nixie decrypts its secrets file in its own process at start. Each container has its own encrypted
secrets file, where [0020](0020-deployment.md) had one for nixie alone.

nixie owns consistency and the sidecar owns transport. nixie is the single writer, so it makes every
database copy and is the only container that opens a database. The sidecar ships the copies nixie
marks complete, and never opens a database. The backup credentials live only in the sidecar's
secrets, and the deployment key lives only in nixie's.

## Why

- A backup credential never enters nixie's process, so a fault in nixie cannot reach the backups.
- The sidecar never holds the deployment key, so it can read none of the backups it ships.
- nixie's single writer stays the one place that decides what a consistent copy is.
- sops decrypts once at start, and moving it out would put the plaintext on a shared volume or a
  socket between containers. A decrypt sidecar lost its volume in the
  [deploy spike](../design/platform/spikes/deploy-local/README.md).

## Alternatives

- **Every tool in the nixie image.** One container, with the backup credentials in nixie's process
  and the backup tools in the trusted core's image.
- **sops in a sidecar too.** The decrypted secrets would cross a container boundary.

## Consequences

- A release publishes one more image, and the 2 containers share a versioned snapshot set format.
- A restore runs in 2 steps: the sidecar fetches and checks, and nixie installs under its writer
  lock.
- Backup notices come from nixie, which reads the sidecar's receipts.
