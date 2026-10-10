# Spike: deploy, back up, restore and roll back on local containers

This spike runs the Compose deployment from
[decision 0020](../../../../decisions/0020-deployment.md) on one machine with local containers only:
a stand-in nixie image pinned by digest from a local registry, secrets encrypted with sops and age,
backups to local restic repos, a restore on a clean host directory from the owner's recovery key
alone, and an upgrade rolled back as a revert plus a restore. All 22 checks passed. A tmpfs volume
does not carry decrypted secrets from one container to another, so the stand-in decrypts inside its
own process. The key store needs its own restic repo that keeps one snapshot, or forgetting does not
reach the backups.

## Questions

1. Can a Compose deployment pin its image by digest and decrypt sops secrets at start without the
   plaintext reaching the repo, the host's disk or the container's configuration?
2. Do the per-item keys from [decision 0010](../../../../decisions/0010-memory-store.md) survive a
   lost host, restored from restic repos and an age key held off the host?
3. Does a forgotten item stay unreadable in every backup, as crypto-shredding requires?
4. Is an upgrade a merge, and a rollback a revert plus a restore?

## Versions

| Component        | Version                                       |
| ---------------- | --------------------------------------------- |
| Bun              | 1.4.2, `oven/bun:1.4.2-slim` pinned by digest |
| sops             | 3.13.3, `ghcr.io/getsops/sops:v3.13.3-alpine` |
| restic           | 0.19.1, `restic/restic:0.19.1`                |
| `age-encryption` | 0.3.1, for key generation in Bun              |
| Registry         | `registry:2`, on loopback                     |
| Docker Engine    | 29.7.2, with Compose v2                       |
| Host             | WSL2, Linux 6.6.87.2                          |

## Setup

[`app.ts`](app.ts) stands in for nixie. It stores memory items encrypted with AES-GCM, a key per
item under a random ID, and keeps each key wrapped with AES-KW by the deployment key in a separate
`keys.db` with `secure_delete` on. It decrypts the sops file at start by running `sops decrypt` and
keeps the plaintext in memory. Build 1 reads and writes schema 1. Build 2 renames the memory table
and adds a column, taking a `VACUUM INTO` copy of the database first, so build 1 cannot read a
database build 2 migrated, and refuses to start on it with exit code 78. Its commands:

| Command                           | Does                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| `serve`                           | Migrates, then serves `/health`, `/memory` and `/forget/<id>` |
| `backup split`                    | Database to the data repo, key store to its own keep-1 repo   |
| `backup naive`                    | Both files to one repo with normal retention                  |
| `restore <repo> <snapshot> <dir>` | Restores one snapshot into a directory                        |
| `snapshots <repo>`                | Lists a repo's snapshots as JSON                              |
| `read <db> <keys>`                | Decrypts every item from 2 files offline                      |

It reads `NIXIE_BUILD`, which the image bakes in, and `NIXIE_SECRETS_SOPS`, `SOPS_AGE_KEY_FILE`,
`NIXIE_DATA_DIR`, `NIXIE_OFFSITE_DIR` and `NIXIE_PORT`. The [`Dockerfile`](Dockerfile) copies the
`sops` and `restic` binaries into the Bun image. [`keygen.ts`](keygen.ts) makes an age identity: an
X25519 host key, and a post-quantum hybrid key for the owner's recovery.
[`compose.template.yaml`](compose.template.yaml) is the deployment repo's Compose file, with the
image digest filled in.

[`run.sh`](run.sh) drives the rest. It builds both images, pushes them to a registry on loopback,
and removes the local copies, so Compose pulls by digest. It makes a throwaway deployment repo with
git, a `.sops.yaml` for both recipients and the encrypted secrets file, commits the build 1 pin, and
then runs each phase with a check per claim. It refuses to start when a container or project with
one of its names exists, and a trap removes every container, volume and image it made on exit.
Results land in `results/`, which git ignores.

## Run it

Docker with Compose, `jq`, `xxd` and `curl` need to be on the host, and ports 55100 to 55102 free.

```bash
cd spikes/deploy-local && bun install
bash run.sh
```

Pull `ghcr.io/getsops/sops:v3.13.3-alpine` and `restic/restic:0.19.1` first if the build cannot
reach the registries, and remove them afterwards with `docker rmi` if nothing else uses them.

## Output

```text
PASS sops 3.13.3 encrypts to a post-quantum hybrid age recipient
PASS the deployment repo and its history hold no plaintext secret
PASS build 1 is healthy at schema 1
PASS no secret in the Compose config, the container's config or its exec environment
PASS no secret on the host's data directory
PASS a plain container restart decrypts again and comes back healthy
PASS item 2 reads as forgotten in the live store
PASS the forgotten wrapped key is gone from the key store's files (secure_delete, checkpoint)
PASS the key store repo keeps 1 snapshot
PASS the database repo keeps both snapshots
PASS an older database snapshot with the current key store keeps item 2 forgotten
PASS a single repo with normal retention brings item 2 back (the case to avoid)
PASS the clean host starts healthy from the restic repos and the recovery key alone
PASS the clean host reads items 1 and 3, and item 2 stays forgotten
PASS build 2 is healthy at schema 2
PASS build 2 took a database backup before it migrated
PASS the reverted pin alone does not start: build 1 refuses schema 2
PASS build 1 says why it refused
PASS after the restore, build 1 is healthy at schema 1
PASS the rollback lost item 4, written after the upgrade, and item 3 stays forgotten
PASS a write after the rollback succeeds, with no ID reused from the discarded span
PASS a key store copy from before the forget would bring item 3 back (never restore it on rollback)
```

| Timing                                    |         ms |
| ----------------------------------------- | ---------: |
| First start, pull to healthy              |      6,575 |
| `sops decrypt` in the process             |         13 |
| Container restart to healthy              |      5,739 |
| First backup run, both repos new          |      9,711 |
| Later backup run                          |      3,180 |
| One restic restore                        | 618 to 792 |
| Clean host, restore both repos to healthy |      8,633 |
| Upgrade, pull to healthy                  |      6,543 |
| Rollback restore to healthy               |      5,791 |

Timings come from one run on a database of a few rows, and each includes the health check's 2 s
interval.

## Answer

### 1. Digest pins and secrets

Compose pulled each build from the registry by digest with no local copy. nixie's secrets never
reached the deployment repo or its history, the Compose config, `docker inspect`, `docker exec env`
or the host's data directory. sops 3.13.3 encrypted to a post-quantum hybrid age recipient that
`age-encryption` 0.3.1 generated, and decrypted with it on the clean host.

The usual pattern, a one-shot service that decrypts into a tmpfs-backed named volume shared with the
app, does not work. A probe wrote a file into such a volume from one container, and a second
container mounting the same volume found it empty: Docker unmounts the tmpfs when the last container
using it exits. The stand-in therefore runs `sops decrypt` itself at start, which took 13 ms, and a
plain container restart decrypts again.

Bun as PID 1 ignored `SIGTERM`, so a restart or an upgrade first waited out Docker's 10 s stop
timeout: a restart took 15.8 s before the app handled `SIGTERM`, and 5.7 s after.

### 2. Keys across a lost host

With the first host's containers gone, a clean directory restored the newest snapshot of each repo
and started healthy, from the restic repos, a clone of the deployment repo and the recovery key
alone. Every item read back, and the integrity check passed.

### 3. Forgetting in backups

Deleting a key with `secure_delete` on and a `TRUNCATE` checkpoint left none of the wrapped key's
bytes in `keys.db` or its write-ahead log. The key store's own repo, pruned to its newest snapshot
with `--max-unused 0`, held one snapshot after 2 runs, and an older database snapshot restored with
it kept the forgotten item unreadable. One combined repo with normal retention returned the
forgotten item in full from its older snapshot.

### 4. Upgrade and rollback

The upgrade was a commit changing the digest, then `docker compose up`. Build 2 copied the database
before migrating. `git revert` alone left nixie down, because build 1 refused schema 2 and logged
why. Restoring the pre-migration copy brought build 1 back healthy, and lost the item written after
the upgrade. An item forgotten after the upgrade stayed forgotten, because the rollback kept the
live key store, while the key store's backup from before that forget would have brought it back.

A first version keyed items by row number. After the rollback, the restored database handed the next
item the row number of the item written after the upgrade, whose key the live key store still held,
and the write failed on the key store's unique key. With random IDs, a write after the rollback
succeeded.

## Untested

- A real registry, a Renovate pull request, and a deploy script on a timer.
- imp beside nixie, and imp images added to impd from a manifest.
- Kubernetes with Pulumi.
- A database of real size, and restic over a network backend.
- A rollback that carries outside actions from the discarded span into the restored log.
- Disk encryption, and a recovery key on a YubiKey or a passkey.
- Litestream, which the [event log spike](../event-log-db/README.md) restored exactly.
