# 0032: Backups leave the host only as host-encrypted ciphertext, shipped by a separate job

- Date: 2026-10-10
- Status: decided

## Decision

Offsite copies sit on provider storage only as ciphertext that the host encrypted. Readable personal
data stays on the host.

nixie's backup tools run in their own container, the backup job, which mounts only the backup
staging folder of nixie's data volume. The backup credentials live only in the job's secret, and the
deployment key lives only in nixie's.

## Why

- Litestream, which replicates the database offsite, has no client-side encryption, and nixie's item
  encryption leaves database pages readable, so the offsite replica needs encryption on the host
  ([replica encryption spike](../../research/replica-encryption/)).
- A backup credential never enters nixie's process, so a fault in nixie cannot reach the backups.
- The job never holds the deployment key, so it can read none of the backups it ships.

## Rejected alternatives

| Option                                               | Why not                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| server-side encryption by the provider               | It would hand the provider readable pages.                                                                                                          |
| every tool in the nixie image, with one secrets file | One container, with the backup credentials in nixie's process and the backup tools in the trusted core's image.                                     |
| the backup tools in a sidecar in nixie's pod         | The sidecar runs for as long as nixie does, and a backup credential then sits in nixie's pod, where a scheduled job holds it only for each job run. |
