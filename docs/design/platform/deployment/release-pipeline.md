# Release pipeline

- Decisions: [0020](../../../decisions/0020-deployment.md),
  [0035](../../../decisions/0035-backup-sidecar.md)

The [release pipeline](../../../architecture/deployment/release-pipeline.md) builds the
conversation, fetch, nixie and web images from one commit, publishes them to GitHub Container
Registry (GHCR) with build provenance attestations, and checks the contract and the migrations
against the last release. This design covers what later slices add to it: the worker, code and
backup images, the pinned binary updates, the rollback test, Renovate in this repo, and attestation
verification at deploy.

## Images

Each image builds for `linux/amd64` only, from one commit, and is pinned by digest wherever it is
used. [The image](deployment.md#the-image) describes what each image holds.

| Image  | Repository                     | Stage                | Pinned by            | First slice |
| ------ | ------------------------------ | -------------------- | -------------------- | ----------- |
| worker | `ghcr.io/<owner>/nixie-worker` | Sandbox images       | The sandbox manifest | 2           |
| code   | `ghcr.io/<owner>/nixie-code`   | Sandbox images       | The sandbox manifest | 8           |
| backup | `ghcr.io/<owner>/nixie-backup` | Beside the web image | The deployment repo  | 5           |

An image joins the pipeline in the slice that first builds it, by adding its Dockerfile and its job
in the stage it belongs to. The worker image builds after the conversation image, from it by digest.
The backup image builds in parallel with the web image, and the tag stage tags it before web and
nixie. A sandbox image also adds its kind to the sandbox manifest and to the check-pulls stage, and
an image the deployment pins also joins the Renovate group in the deployment repo. The first push of
each image creates its GHCR package as private, so the release that adds a sandbox image stops at
the check-pulls stage until its package is set public, as
[releasing](../../../runbooks/releasing.md#make-a-new-sandbox-image-public) describes.

The Android app ships through its own route in slice 9 and stays outside this pipeline.

## Pinned binaries

The nixie image holds `sops`, and the backup image holds `sops`, `restic`, `litestream` and
`rclone`, each downloaded by the build.

Each image keeps one file beside its Dockerfile that lists each binary with its version, download
URL and SHA-256 checksum. The build downloads each binary at its pinned version and checks it
against the recorded checksum with `sha256sum -c` before it adds the binary, and a mismatch fails
the build. **Why:** a checksum fetched from the download origin during the build proves nothing
against that origin, and a recorded one fixes the exact file the repo reviewed.

An update changes the version and the checksum in the same commit. The tool that writes them checks
the downloaded file against the upstream release's checksum file and its signature, where the
project signs one, before it records the checksum.

## Attestation verification

Nothing verifies an attestation yet. A later stage adds verification in 2 places:

- **The pin pull request.** A check in the deployment repo verifies the nixie, web and backup
  digests and every digest in the nixie image's sandbox manifest, before the pin can merge.
- **The deploy script.** The host verifies the same digests after `docker compose pull` and before
  `docker compose up`, as a stage in the [delivery](upgrades.md#delivery) script.

The pin pull request comes first. **Why:** it stops a bad digest before it enters the record of what
runs, and it needs no tooling on the host.

## The rollback test

The
[compatibility checks](../../../architecture/deployment/release-pipeline.md#compatibility-checks)
lint each migration since the last release. A rollback test adds the proof that the last release
runs on the schema the pull request leaves. CI migrates a database to the last release's schema,
fills it through the last release's own end-to-end suite, migrates it with the pull request's build
and writes to it, then starts the last release's nixie image on it and runs that release's suite
again.

The rollback test compares against one release back, which matches the rollback that
[upgrades](upgrades.md#rolling-back) supports. A deployment whose pin skips a release can roll back
only to a release the test never compared against, and the open call on
[skipped releases](#open-for-sign-off) covers it.

A build that declares the break skips the rollback test, and the release notes mark the schema
unreadable by the release before. The rollback test runs when a pull request adds a migration, and
always on the release pull request. **Why:** it pulls the last release's image and runs 2 suites,
and a pull request without a migration leaves the schema unchanged.

## Renovate

Renovate configuration in this repo covers the base image digests in the Dockerfiles and the action
SHAs in the workflows. The deployment repo holds the Renovate configuration for its Compose file and
Kubernetes manifests, which groups the nixie, web and backup pins into one pull request, as
[upgrades](upgrades.md#the-pin-and-the-bot) describes.

## Open for sign-off

Each item gives the recommendation the doc above follows, and the alternative.

1. **Visibility of the nixie, web and backup images.** Recommended: public, like the sandbox images.
   The repo is public and the images hold no secret, so a public image costs nothing and the host
   pulls with no credential. Alternative: private, which needs a read-only package token on every
   host and in the deployment repo's CI.
2. **Dockerfile location for the worker and code images.** Recommended: `images/<image>/` at the
   root, outside the workspace, one folder per image, because neither image has a package.
   Alternative: `deploy/images/<image>/`, beside the deployment artifacts.
3. **Pinned binary updates.** Recommended: a script that resolves the latest version of each binary,
   checks it against the upstream checksum file and signature, and rewrites the pin file, run by a
   weekly workflow that opens one pull request. Alternative: a Renovate regex manager that bumps the
   version, with the checksum updated by hand on its pull request.
4. **Skipped releases.** Recommended: a check in the deployment repo's pin pull request that refuses
   a jump over more than one release when any skipped release removes a procedure, declares a schema
   break or holds a migration the old pin's release cannot read. Renovate rewrites an open pin pull
   request to the newest release, so a jump happens whenever 2 releases land before a merge.
   Alternative: a removal waits 2 releases after its deprecation, which covers a jump of one skipped
   release only.
