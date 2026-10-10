# Deployment

- Decisions: [0020](../../decisions/0020-deployment.md),
  [0032](../../decisions/0032-offsite-backups-and-replication.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

nixie runs as one container from one image, with the web client in a second container beside it,
next to an imp host on the same machine. Its state is one SQLite database and a key store beside it.
nixie supports 2 deployments from the first build: [Kubernetes](#kubernetes), and Docker Compose,
the reference recipe for local and development use and for any single host. The deployment repo pins
the images by digest and holds one encrypted secrets file. An upgrade is a merged pin bump, and a
rollback is a revert.

nixie owns portable behaviour: the images, the lifecycle, and the secrets, backup and health
contracts. The deployment repo owns the infrastructure, the secrets, the backend settings and the
pinned version. The definitions repo owns your persona, prompts, jobs and policy seed. Backups and
restore live in [backup and restore](./backup-and-restore.md), and releases, migrations and rollback
live in [upgrades](./upgrades.md).

## First build

The first build ships the smallest deployment that keeps every guarantee true:

- **Kubernetes or Compose,** with impd beside nixie, the nixie and web images pinned by digest, and
  one encrypted secrets file that nixie decrypts in its own process.
- **Hourly restic snapshots** of `nixie.db` and `keys.db` to 2 repos, with the key repo kept to one
  snapshot.
- **Forget completes after the key repo prunes.** A forget starts a key backup at once, and key
  publication and forget share one lock. The forget reports pending until that job prunes every
  older key snapshot. [Memory](../memory/store.md) owns what forget means.
- **Restore on a new host,** with recovery holds that stop a restored task from repeating an action.
- **Upgrades as pin bumps,** by hand or by a poll timer. Every release keeps its schema readable by
  the release before it, so a rollback by one release is a revert with no restore.
- **A health endpoint,** with a push notice when a part turns unready.

[Scope](../../scope.md) places backups, safe upgrades and rollback in tier 2. Later stages add:

- the offsite Litestream replica through the rclone crypt gateway, once its matching-key recovery
  passes on a real bucket
- key publication on every key-store change, which lets publication and forget run concurrently
- `nixie rollback` past a schema the older build cannot read
- the monthly restore check and the outbound heartbeat

## The host

A host runs nixie, the imp host and the backups. It needs:

- **Linux on x86-64 with `/dev/kvm`,** on bare metal or a VM with nested virtualization, because imp
  boots every worker and the conversation in a microVM
  ([imp install](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/install.md)).
- **Docker Engine with Compose v2,** or a Kubernetes node.
- **Memory for the imps.** The conversation imp stays awake, and each running worker holds an imp.
  nixie runs at most 3 workers at once by default, which the
  [imp worker spike](../../../spikes/imp-worker-start/README.md) sizes at about 8 GiB for imps.
- **An encrypted disk,** such as LUKS or the provider's volume encryption. SQLite and restic leave
  the live files unencrypted at rest, and nixie's own encryption covers erasable fields and memory
  only.
- **Outbound network only.** nixie and the web server bind to loopback or the private network, and
  you reach the web client over Tailscale. An inbound route exists only for a channel or connector
  that needs webhooks.
- **One host name for the web client and the API.** A reverse proxy sends `/rpc` to nixie and every
  other path to the web server, and terminates HTTPS for that name.

nixie runs as a non-root user with a read-only root filesystem, and never mounts the Docker socket.
**Why:** the socket gives root on the host.

imp runs as its own stack from its release image, outside nixie's Compose file or cluster. nixie
reaches impd's API with a token from the secrets, through the sandbox adapter. **Why:** impd runs as
root with extra capabilities, so keeping it apart keeps nixie unprivileged and lets imp upgrade on
its own schedule. A model in an imp reaches nixie's tools through imp's reverse forward with egress
`none`, as the [sandbox adapter](../connectors/sandbox-adapter.md) describes.

## The image

A nixie release publishes one nixie image, one web image and one imp image per kind of work, all
from one commit and each pinned by digest. The nixie image carries a manifest of its imp images'
digests. The deployment pins the nixie and web images, and both pins move in the same pull request.

The oRPC contract follows the schema rule from [upgrades](./upgrades.md): a release adds procedures
and fields, and a removal waits until the release before no longer calls it, so an API serves the
web client of its own release and of the release before. An upgrade replaces nixie first and the web
container second, and a rollback replaces the web container first and nixie second. **Why:** in both
orders the web client only ever calls an API of its own release or a newer one, and a failed nixie
step stops the rollout before the web container changes.

The web image holds the TanStack Start server and its built assets, and no secrets, database or
credentials. **Why:** the process that holds policy, credentials and the approval check carries no
UI framework or server-rendering dependencies.

The nixie image holds Bun on a slim base, every workspace package bundled with `bun build`, and the
`sops`, `restic`, `litestream` and `rclone` binaries. The nixie image holds no Claude Code build.
**Why:** every model loop runs in an imp, and leaving out the SDK's native packages saves about 480
MB.

| Image        | Holds                                              | Runs                            |
| ------------ | -------------------------------------------------- | ------------------------------- |
| Conversation | Bun, nixie's turn runner, the SDK with Claude Code | The long-lived conversation imp |
| Worker       | The conversation image plus the code runtimes      | One imp per worker run          |
| Code         | The code tool's runtimes, with no SDK              | A code run in a disposable imp  |
| Fetch        | A minimal base and the web fetch's fetcher         | The long-lived fetch sandbox    |

The worker image carries the code runtimes because a code run that a worker starts runs in that
worker's own imp. The [coding design](../connectors/coding.md) sets the runtimes.

nixie adds each imp image named in its manifest to impd at start, once per digest, before any runner
claims work. The images live on a public registry, because impd pulls without credentials and the
images hold no personal data.

## Secrets

nixie reads its secrets from one encrypted file and decrypts it in its own process at start. The
deployment repo chooses how it supplies the file: the Compose recipe uses sops with age, and a
Kubernetes deployment uses sops or a secrets manager. In the sops recipe, the file is encrypted to 2
age recipients. The host key lives on the host, readable only by nixie's user. Your recovery key
stays off the host, and a restore on a new host needs only it.

| Secret                        | Used for                                                |
| ----------------------------- | ------------------------------------------------------- |
| Deployment key                | Wraps every per-record, per-item and per-credential key |
| restic password               | Encrypts every backup                                   |
| Model credentials             | One per model profile, the grant each imp holds         |
| Replica crypt password, salt  | rclone object encryption and restore                    |
| impd token                    | The sandbox adapter's calls to impd                     |
| Push notifier and search keys | Static values for channels and tools                    |

Credentials you enter through connector setup live in the database credential backend, each with its
own key wrapped by the deployment key. The [credential store](../connectors/credentials.md) covers
the backends.

nixie decrypts the sops file inside its own process at start, with the host key mounted read-only,
and keeps the plaintext in memory. A container restart decrypts again, so the restart policy brings
nixie back after a reboot. **Why:** a decrypt-to-tmpfs sidecar lost its volume when the sidecar
exited in the [deploy spike](../../../spikes/deploy-local/README.md), and a Compose secret or an
environment variable puts the plaintext on disk or in the container's configuration.

You change a secret by editing the file with `sops`, committing and deploying. `sops updatekeys`
replaces the host key. A nixie command rewraps every key in the key store in one transaction when
the deployment key changes. A leaked age key decrypts every earlier commit of the file, so recovery
rotates every secret the file ever held.

## Seeding the definitions

The [definitions source](../connectors/definitions-source.md) returns a snapshot of your definitions
with a revision and a content hash. nixie seeds the database from it at start, after migrations and
before any runner claims work, and again on each new revision. nixie polls every 5 minutes by
default, or takes a webhook.

A seed runs in one transaction. Narrowing changes apply with a record, a widening change becomes a
proposal you confirm in the client, and a rule edited at runtime shows its conflict with the repo.
nixie refuses a snapshot that fails to parse or validate, keeps the last seed and tells you.
**Why:** a half-applied seed would leave rules from 2 revisions in force at once.

The first seed into an empty database applies its deny and ask rules at once and gathers every allow
rule into one confirmation. Until you approve it, every tool call with no applied allow rule asks.

The definitions files carry a format version. A release reads its own format version and the one
before, and refuses an older snapshot with the version it needs. **Why:** an image upgrade and a
definitions change land as separate merges in separate repos, in either order.

## Health and monitoring

nixie reports its health through a health endpoint for the container runtime and through notices
while it runs. Liveness holds when the process answers and the database opens. Readiness lists each
part:

| Part             | Ready when                                                 |
| ---------------- | ---------------------------------------------------------- |
| Database         | Migrations finished and the last integrity check passed    |
| Definitions      | The last seed applied, with no refused snapshot pending    |
| imp host         | impd answers, and every imp image in the manifest is added |
| Conversation imp | Awake, and its last turn did not fail on start             |
| Backups          | The last backup finished within twice the backup interval  |
| Disk             | Under 90% full on the data volume                          |
| Spending         | The hard spending stop has not fired                       |

A part that turns unready raises a status report in the live view, and the push notice carries only
the standard count and link. A later stage adds an outbound heartbeat: an empty request every 5
minutes to an endpoint the deployment picks, so an outside monitor alerts when nixie is down.

The web server has its own health endpoint: live when it answers, and ready when it reaches nixie's
API.

nixie logs JSON lines to stdout, through Docker's local log driver with rotation. A log line holds
envelope fields only, such as IDs, kinds and outcomes, never message text, tool arguments or
results. **Why:** a log line that copied content would keep it after its key is gone.

nixie handles `SIGTERM` itself, because Bun as PID 1 ignores it.

## Deployment configuration

The deployment repo chooses how a merged pin reaches its hosts, where it keeps the recovery key, the
backup backends, the heartbeat endpoint, the [model profiles](../core/models.md) with the role map,
and any overrides of the [budget defaults](../policy/budgets.md#model-cost). These are configuration
under 0020, not platform choices. Backups use the S3-compatible and other backends that Restic and
rclone already support, and nixie adopts no cloud provider. Every deployment honours writer
shutdown, migrations, image compatibility and recovery, whether it runs on Compose or Kubernetes.
The deployment checks that its recovery key decrypts the secrets on a clean host.

## Kubernetes

Kubernetes runs the same images as Compose, from manifests in your deployment repo. One SQLite
writer sets its shape:

- one replica in a StatefulSet with a `ReadWriteOnce` volume, which stops the old pod before the new
  one starts
- the web client as its own Deployment, which holds no state and can run more than one replica
- one ingress on one host name, with a path rule that sends `/rpc` to nixie and a default rule to
  the web client
- the secrets file and its decryption key as a Secret mounted read-only, which nixie decrypts at
  start
- impd on each node that runs nixie, outside the cluster, with its API reachable from nixie's pod

nixie keeps one writer itself, with the
[writer lock and epoch](../core/event-log.md#the-single-writer), so a rollout's new pod waits on the
lock until the old pod exits. The data volume is block storage on the node, because nixie refuses a
network filesystem. imp's client delivers each reverse-forward connection to nixie over nixie's own
connection to impd, so the pod opens no inbound port for its tools. The reverse forward from a pod
is a spike in [open items](../open-items.md#spikes-and-design-tasks), which checks that route with
egress `none` still holding.
