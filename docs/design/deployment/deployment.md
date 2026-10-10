# Deployment

- Status: Proposed
- Decisions: [0032](../../decisions/0032-offsite-backups-and-replication.md),
  [0010](../../decisions/0010-memory-store.md), [0016](../../decisions/0016-own-interfaces.md),
  [0020](../../decisions/0020-deployment.md), [0025](../../decisions/0025-database-and-topology.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

nixie runs as one container from one image, next to an imp host on the same machine, with its state
in one SQLite database and a key store beside it. Docker Compose on one host is the recommended
deployment, and Kubernetes managed with Pulumi is also viable, under
[0020](../../decisions/0020-deployment.md). The deployment repo pins the image by digest and holds
the secrets encrypted with sops and age, and nixie decrypts them inside its own process at start. An
upgrade is a merged pin bump and a rollback is a revert, with a database restore only when the
schema demands it. Everything in this doc beyond the decisions it links is a proposal.

Two docs sit beside this one: [backup and restore](./backup-and-restore.md) covers backups, the key
store and recovery from a lost host, and [upgrades](./upgrades.md) covers how a release reaches the
host, migrations and rollback. The [deploy spike](../../../spikes/deploy-local/README.md) ran the
Compose path end to end on local containers.

## First build

The first build ships the smallest deployment that keeps every agreed guarantee true, and the rest
of this design arrives in later stages. [Scope](../../scope.md) places backups, safe upgrades and
rollback in tier 2, so none of the later stages blocks the owner's first use. This split is a
proposal for the owner to confirm.

The first build holds:

- **Compose on one host,** with imp beside nixie, the image pinned by digest, and secrets in one
  sops file with the host key and the owner's recovery key.
- **Hourly restic snapshots** of `nixie.db` and `keys.db` to their 2 repos, with the key repo kept
  to one snapshot.
- **Forget completes after the key repo prunes.** A forget starts a key backup at once, and only one
  backup job runs at a time. The forget reports pending until that job prunes every older key
  snapshot, so [0010](../../decisions/0010-memory-store.md) holds without the generation barrier
  that concurrent publishers need.
- **Restore on a new host,** with the recovery holds that stop a restored task from repeating an
  outside action.
- **Upgrades as pin bumps,** delivered by hand or by the poll timer. Every first-build release keeps
  its schema readable by the release before it, so every rollback is a revert with no restore.
- **The health endpoint,** with a push notice when a part turns unready.

Later stages add:

- the offsite Litestream replica through the rclone crypt gateway from
  [0032](../../decisions/0032-offsite-backups-and-replication.md), once its matching-key recovery
  and a real bucket pass their tests
- key publication triggered by each key-store change, with the generation barrier from
  [forget-triggered key cleanup](./backup-and-restore.md#forget-triggered-key-cleanup)
- `nixie rollback` past a schema the older build cannot read, with outside-action import from
  [rolling back](./upgrades.md#rolling-back)
- the monthly restore check and the outbound heartbeat
- [Kubernetes with Pulumi](#kubernetes-with-pulumi)

## The host

A host runs nixie, the imp host and the deployment's backups. It needs:

- **Linux on x86-64 with `/dev/kvm`:** bare metal, or a VM with nested virtualization. imp boots
  every worker and the conversation in a microVM under
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md), and imp needs KVM and the
  iptables `rpfilter` and `addrtype` matches
  ([imp install](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/install.md)).
- **Docker Engine with Compose v2.** nixie runs as a Compose service, and imp runs from its own
  release image in its own host container.
- **Memory for the imps.** The conversation imp stays awake for the deployment's life, and each
  running worker holds an imp. The [imp worker spike](../../../spikes/imp-worker-start/README.md)
  ran imps with 2 vCPUs and 2,048 MiB each, so a host with 3 workers at once needs about 8 GiB for
  imps plus nixie and the imp host. nixie runs at most 3 workers at once by default, and the owner
  can change the limit. The figure comes from the spike's imp shape, not from a load test.
- **An encrypted disk,** such as LUKS or the provider's volume encryption. Neither SQLite under Bun
  nor restic on the host encrypts the live files at rest
  ([storage notes](../../research/2.4-notes/data-and-storage.md#backups-and-encryption-at-rest)).
  nixie's own encryption covers erasable fields and memory, not the event log's envelopes.
- **Outbound network only.** nixie binds to loopback, and the owner reaches the client over
  Tailscale under 0020. An inbound route exists only when a channel or connector needs webhooks.

nixie runs as a non-root user with a read-only root filesystem, and never mounts the Docker socket.
**Why:** the socket gives root on the host, and nixie reaches imp through imp's API instead.

### imp beside nixie

imp runs as its own stack from its release image, which bundles impd, the CLI, the guest kernel and
the system drive ([imp install](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/install.md)).
nixie reaches impd's API with a token from the deployment's secrets, through the sandbox adapter
from [0016](../../decisions/0016-own-interfaces.md). **Why:** impd runs as root with extra
capabilities and its own Docker proxy, and keeping it out of nixie's Compose file keeps nixie's
service unprivileged and lets imp upgrade on its own schedule. The sandbox adapter supplies a
run-bound loopback route to nixie's tools through the guest agent's reverse forward, with egress
`none`, under [0030](../../decisions/0030-connectors-and-sandbox-environments.md). It never
substitutes an address-wide allow entry that exposes impd.

## The image

A release of nixie publishes one nixie image and one imp image per kind of work, all from the same
commit and each pinned by digest. The deployment pins only the nixie image. The nixie image carries
a manifest with the digest of each matching imp image, so one pin fixes every image a deployment
runs.

The nixie image holds the modular monolith from
[0025](../../decisions/0025-database-and-topology.md) as one deployable:

- Bun 1.4.2 on a slim base, pinned by digest
- every workspace package, bundled with `bun build`
- the web client's static files
- the `sops`, `restic`, `litestream` and `rclone` binaries for secrets, backups and the encrypted
  replica

The nixie image holds no Claude Code build. **Why:** every model loop runs in an imp under 0026, so
the host process needs only nixie's tools, and leaving out the SDK's 2 native Claude Code packages
saves about 480 MB ([imp worker spike](../../../spikes/imp-worker-start/README.md)). In the deploy
spike, the stand-in image was the 71 MB Bun base plus 52 MB for `sops` and 31 MB for `restic`.

The imp images follow the consequence in 0026, a minimal base with only what one kind of work needs:

| Image        | Holds                                                        | Runs                                    |
| ------------ | ------------------------------------------------------------ | --------------------------------------- |
| Conversation | Bun, nixie's turn runner, the SDK with the glibc Claude Code | The long-lived conversation imp         |
| Worker       | The conversation image plus the code runtimes                | One imp per worker run                  |
| Code         | The language runtimes the code tool offers, and no SDK       | Code in a disposable imp with no grants |

The worker image adds the code runtimes, because the code tool called from a worker runs in that
worker's own imp. The code tool under [0022](../../decisions/0022-coding-and-code-execution.md)
picks the runtimes, in the connectors design.

imp boots any OCI image, and impd adds an image from a public registry reference in about 6 to 10 s
([imp images](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/images.md)). nixie adds each
imp image named in its manifest at start, once per digest, before any runner claims work. impd pulls
without registry credentials, so the imp images live on a public registry with the nixie image.
**Why:** the system tier is public under the [overview](../../overview.md#tiers), and its images
hold no owner data.

## Secrets

The deployment repo holds one sops file, encrypted to 2 age recipients: the host key and the owner's
recovery key. The host key lives on the host, readable only by nixie's user. The recovery key stays
with the owner, off the host, and is the one key a restore on a new host needs.

| Secret                                   | Used for                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Deployment key                           | Wraps the per-record, per-item and per-credential keys in the key store |
| restic password                          | Encrypts every backup                                                   |
| Model credential                         | The broker grant that each imp holds under 0026                         |
| Replica crypt password and optional salt | rclone object encryption and restore                                    |
| impd token                               | The sandbox adapter's calls to impd                                     |
| Push notifier and search keys            | Static values for channels and tools, such as a bot token               |

OAuth clients and tokens that the owner enters through connector setup live in the writable database
credential backend. Each credential has its own encryption key in the key store, wrapped by the
deployment key; runtime credential values are not encrypted directly with the deployment key. The
deployment can supply a static credential through its read-only backend instead. A connection
records the selected backend explicitly, and nixie never silently shadows it with a value from
another source. The [credential store design](../connectors/credentials.md) covers the store and its
backends.

nixie decrypts the sops file inside its own process at start: it runs `sops decrypt` with the host
key mounted read-only and keeps the plaintext in memory. In the deploy spike, decryption took 13 to
21 ms, and no secret appeared in the Compose config, the container's configuration, its exec
environment or the host's data directory. A plain container restart decrypts again, so Docker's
restart policy brings nixie back after a host reboot with no other service involved. **Why:** the
usual Compose pattern, a one-shot service that decrypts into a shared tmpfs volume, fails: a
tmpfs-backed named volume lost its contents as soon as the writing container exited, so the service
that reads it found an empty directory. A Compose secret from a file, or an environment variable,
puts the plaintext on the host's disk or in the container's configuration.

The owner changes a secret by editing the file with `sops`, committing and deploying. Replacing the
host key is `sops updatekeys` with the new recipient. Replacing the deployment key means rewrapping
every wrapped key in the key store with both deployment keys present, which a nixie command does in
one transaction. A leaked age key decrypts every earlier commit of the file, so recovery rotates
every secret the file ever held
([deployment notes](../../research/2.6-notes/deployment.md#recommendations)).

## Seeding the definitions

The definitions source, sketched in the
[definitions source design](../connectors/definitions-source.md), returns a snapshot of the owner's
definitions with a revision and a content hash. nixie seeds the database from it, under the rules in
[0020](../../decisions/0020-deployment.md) and the widening check in the
[policy design](../policy/rules.md#the-widening-check). A seed runs at 2 points:

- **At start,** after migrations and before any runner claims work, so a task never runs on rules
  older than the definitions the host holds.
- **On a new revision.** nixie polls the source every 5 minutes by default, and the owner can change
  the interval or point a webhook at it.

A seed runs in one transaction. Narrowing changes apply with a record, a widening change becomes a
proposal for the owner to confirm in the client, and a rule edited at runtime shows its conflict
with the repo. A snapshot that fails to parse or validate is refused whole: nixie keeps the last
seed, records the refusal and tells the owner. **Why:** a half-applied seed would leave rules from 2
revisions in force at once.

The first seed into an empty database widens every allow rule it holds. nixie applies its deny and
ask rules at once and gathers every widening into one confirmation that lists each rule, which the
owner approves in the client as always-ask. Until then, every tool call with no applied allow rule
asks, as "no rule matched" does under [0004](../../decisions/0004-rule-engine.md).

The definitions files carry a format version. A nixie release reads its own format version and the
previous one, and a snapshot in an older format is refused with the version it needs. **Why:** an
image upgrade and a definitions change arrive as separate merges in separate repos, so either can
land first.

## Health and monitoring

nixie reports its health in 3 places: a health endpoint for the container runtime, notices to the
owner for a part that fails while nixie runs, and an outbound heartbeat for when nixie is down.

The health endpoint reports 2 states. Liveness holds when the process answers and the database
opens, and the Compose health check reads it. Readiness lists each part with its state:

| Part             | Ready when                                                 |
| ---------------- | ---------------------------------------------------------- |
| Database         | Migrations finished and the last integrity check passed    |
| Definitions      | The last seed applied, with no refused snapshot pending    |
| imp host         | impd answers, and every imp image in the manifest is added |
| Conversation imp | Awake, and its last turn did not fail on start             |
| Backups          | The last backup finished within twice the backup interval  |
| Disk             | Under 90% full on the data volume                          |
| Spending         | The hard spending stop has not fired                       |

The live view shows readiness, and a part that turns unready creates a platform status report
flagged for attention, with its details in the client. The channel adapter sends only the standard
count, fixed sentence and opaque link under [0009](../../decisions/0009-first-channel.md), never the
part or its state.

A push notice needs a running nixie. The deployment can configure an outbound heartbeat: an empty
request to its chosen endpoint every 5 minutes by default, with no task, message or owner content.
Its external monitor alerts when heartbeats stop, and the deployment's upgrade runner reports a
failed deploy through the monitor's supported protocol. The platform exposes health and configurable
heartbeat behavior; the endpoint, credentials, monitor and host supervision belong to the
deployment.

nixie logs to stdout as JSON lines, through Docker's local log driver with rotation. A log line
holds envelope fields only, such as IDs, kinds and outcomes, and never message text, tool arguments
or results. **Why:** the event log is the record, with erasable fields under
[0010](../../decisions/0010-memory-store.md), and a log line that copied content would keep it after
its key is gone.

In the deploy spike, Bun ran as PID 1 and ignored `SIGTERM`, so every stop waited out Docker's 10 s
timeout and ended in `SIGKILL`. nixie handles `SIGTERM` itself, as
[upgrades](./upgrades.md#a-release-on-the-host) describes.

## Kubernetes with Pulumi

The same images run on Kubernetes, managed by the owner's Pulumi program in an infrastructure repo
apart from the definitions repo, under 0020. The program pins the nixie image by digest, as the
Compose file does. The shape follows from one SQLite writer:

- one replica, in a StatefulSet with a `ReadWriteOnce` volume and the default `RollingUpdate`
  strategy, which stops the old pod before its normal replacement. The deployment must confirm
  writer shutdown or isolate the old host from storage and outside services before a forced
  replacement
- the sops file and the host key as a Kubernetes Secret mounted read-only, decrypted by nixie at
  start as on Compose
- impd on each node that runs nixie, outside the cluster or as a privileged pod with `/dev/kvm`

A
[ReadWriteOnce volume](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes)
limits writable attachment to a node, not to one pod on that node. It does not itself prevent two
writers. The deployment must preserve single-writer ownership during normal rollouts and forced
recovery.

The owner tests this path in practice. How impd runs beside a cluster is the open part, and the
[open items](../open-items.md#spikes-to-run) list it.

## Agreed backup design

1. **The backup tool and the replica: agreed.** Restic holds scheduled encrypted snapshots, and
   Litestream replicates `nixie.db` offsite through configurable S3-compatible storage. The
   deployment supplies the endpoint, bucket, region, credential references and backend compatibility
   settings. Restic and rclone already expose storage backends; nixie keeps ordinary storage calls
   behind those backends and adopts no cloud provider. Amazon S3 and Cloudflare R2 are example
   deployments, with [R2 documented by rclone](https://rclone.org/s3/#cloudflare-r2). Backend
   retention and deletion behavior need validation before the deployment relies on forget
   completion.

   The snapshot path restored on a clean host in the deploy spike. The
   [paired-store control](../../../spikes/forget-backups/) shows that current data with an older key
   backup cannot decrypt a newly created item. A validated matching-key recovery path therefore
   remains necessary before the continuous replica can promise a shorter recovery window. Litestream
   does not replicate `keys.db`, because its historical copies would preserve deleted keys. Restic
   alone accepts up to an hour of lost writes at the proposed interval; Kopia is the alternative
   snapshot tool that was not chosen.

   **Replica encryption: agreed.** The host runs a local
   [rclone S3 gateway](https://rclone.org/commands/rclone_serve_s3/) over a
   [crypt remote](https://rclone.org/crypt/). Litestream sends database replica objects to that
   endpoint, and rclone encrypts their payloads and filenames before upload. This keeps readable
   database envelopes off provider storage. The gateway adds one experimental process between
   Litestream and the bucket. A local Litestream file replica with a separate encrypted uploader was
   not chosen, because it adds upload scheduling and consistency work. Litestream 0.5.x has no
   built-in client-side age encryption
   ([configuration](https://litestream.io/reference/config/#encryption)).

   The [replica encryption spike](../../../spikes/replica-encryption/) tests the gateway locally,
   including process outages and a restore without the original database. It does not test a cloud
   provider, key recovery or uploads interrupted in flight. Server-side encryption alone was not
   chosen: it protects storage at rest but trusts the provider with readable pages. With SSE-C,
   uploads and reads send the key to the provider over TLS. These provider-side features do not
   replace the selected host-side encryption.

## Deployment configuration

The deployment repo chooses how a merged image pin reaches its hosts, where it keeps recovery
identities, and which external service checks liveness. These are configuration choices under 0020,
not platform technology choices. nixie supplies the lifecycle, secrets and health contracts that
each configuration must meet.

[Upgrade delivery](./upgrades.md#delivery) includes poll, webhook and manual recipes. The deployment
can use its own orchestrator instead, provided it honors writer shutdown, migrations, image
compatibility and recovery. The sops reference path accepts the deployment's configured age
recipients; the platform does not choose paper storage, a hardware device or a personal passkey
library. The deployment validates that its recovery identity can decrypt the secrets on a clean host
and keeps it apart from that host. Heartbeat URLs and monitoring services are deployment
configuration too.
