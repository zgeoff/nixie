# 0020: Deployment and definitions

- Date: 2026-10-08
- Updated: 2026-10-29
- Status: decided
- Design: [deployment](../design/platform/deployment/deployment.md),
  [definitions source](../design/platform/connectors/definitions-source.md),
  [backup and restore](../design/platform/deployment/backup-and-restore.md)
- Research:
  [deployment notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.6-notes/deployment.md)

Running nixie and defining nixie are separate, across 3 repos:

- **The nixie repo** holds the platform: behaviour, contracts, adapters and reference
  implementations.
- **A definitions repo,** private, holds your persona, prompts, jobs and policy seed.
- **A deployment repo** holds the image version, infrastructure, secrets, backups and backend
  settings, such as which S3-compatible storage holds backups.

nixie reads its definitions through the definitions source from [0016](0016-own-interfaces.md). A
git repo, a local path and bucket storage are all valid sources, and the choice is independent of
how nixie is deployed.

## Seeding

The definitions seed the database, and the database is the one place to look, through the client or
the live view. Each rule records its source: seeded from a commit, or created at runtime with the ID
of the approval that created it, under [0013](0013-definition-versioning.md).

- **A seeded rule that changes in the repo** updates in the database at the next seed, unless it was
  edited at runtime. A runtime edit marks it overridden, and the conflict shows in the client to
  resolve.
- **A rule deleted from the repo** is removed at the next seed. Removing an allow rule only narrows,
  so it applies at once with a record, under [0005](0005-effects-and-taint.md). Removing a deny rule
  widens, so it follows the next case.
- **A repo change that widens the rules,** such as a looser allow rule or a removed deny rule,
  applies only after you confirm it in the client. Widening is in the always-ask set, and merging a
  pull request is not an approval.

nixie can export runtime rules to the definitions repo as a pull request in YAML, the rule format
from [0028](0028-policy-design.md). Once you merge it, the next seed marks those rules as seeded.

## Deployment models

- **Kubernetes:** one nixie replica in a StatefulSet, with impd on the node outside the cluster. It
  suits a deployment that runs for good.
- **Docker Compose:** the reference recipe beside an imp host, for local and development use and for
  any single host.

Both models are supported from the first build, with the same pinned images, the same separate
definitions repo, an encrypted secrets file per container, upgrades as pull requests that bump the
image digest, a database copy before each migration, backups under
[0032](0032-offsite-backups-and-replication.md), and access over a private network such as
Tailscale, with HTTPS on a fixed name.

## The backup job

nixie's backup tools run in their own container, the backup job, which mounts only the backup
staging folder of nixie's data volume: a scheduled job on Kubernetes and a looping container in
nixie's Compose project. restic, Litestream and the rclone crypt gateway live in the backup image,
built and released with nixie's other images. sops stays in the nixie image, and nixie decrypts its
secrets file in its own process at start.

nixie owns consistency and the job owns transport. nixie is the single writer, so it makes every
database copy and is the only container that opens a database. The job ships the copies nixie marks
complete, writes a receipt for each, and never opens a database. The backup credentials live only in
the job's secret, and the deployment key lives only in nixie's.

## Why

- nixie opens pull requests to the definitions repo when it exports rules, and needs no write access
  to an infrastructure repo to change a rule.
- Definitions change often and infrastructure rarely, so separate repos keep each history readable.
- A separate definitions repo is the same artifact for every deployment, so any deployment model
  tests the portable one.
- One place to look for rules answers "why did nixie allow this?" without comparing the repo and the
  database.
- Confirming a widening in the client keeps someone with access to your git host from widening
  nixie's rules.
- A backup credential never enters nixie's process, so a fault in nixie cannot reach the backups.
- The job never holds the deployment key, so it can read none of the backups it ships.
- nixie's single writer stays the one place that decides what a consistent copy is.
- sops decrypts once at start, and moving it out would put the plaintext on a shared volume or a
  socket between containers. A decrypt sidecar lost its volume in the
  [deploy spike](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes/deploy-local/README.md).

## Alternatives

- **Compose first, Kubernetes later.** It keeps the first build on one host, and leaves a cluster
  deployment untested until after the first build.
- **One deployment repo that pins the version and holds the definitions.** It suits Compose, and
  puts definitions next to infrastructure for other setups.
- **The repo as the baseline and the database as a runtime layer on top.** It leaves 2 places to
  look when you ask why nixie allowed an action.
- **Every tool in the nixie image, with one secrets file.** One container, with the backup
  credentials in nixie's process and the backup tools in the trusted core's image.
- **sops in a sidecar too.** The decrypted secrets would cross a container boundary.
- **The backup tools in a sidecar in nixie's pod.** The sidecar runs for as long as nixie does, and
  a backup credential then sits in nixie's pod, where a scheduled job holds it only for each job
  run.

## Consequences

- Memory, conversations and the event log never go in the definitions repo.
- A release publishes a backup image beside the nixie image, and the 2 containers share a versioned
  snapshot set and receipt format.
- A restore runs in 2 steps: the backup job fetches and checks, and nixie installs under its writer
  lock.
- Backup notices come from nixie, which reads the job's receipts.

## Changes

- 2026-10-10: the backup tools run in a sidecar container, and each container has its own encrypted
  secrets file. The first version had one secrets file, for nixie alone.
- 2026-10-15: record 0035, The backup sidecar, merged into this record.
- 2026-10-29: the backup tools run as a scheduled job that mounts the staging folder, not as a
  sidecar in nixie's pod.
