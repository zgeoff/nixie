# Release pipeline

- Decisions: [0020](../../../decisions/0020-deployment.md),
  [0035](../../../decisions/0035-backup-sidecar.md)

A nixie release is one version, cut from one commit on `main`, that publishes every nixie image to
GitHub Container Registry (GHCR). release-please opens a release pull request from the Conventional
Commits since the last release, and merging it creates the tag. The release workflow then builds the
sandbox images, the nixie image with their digests inside it, and the web and backup images, in that
order. Each image gets a build provenance attestation as it is pushed, and the version tag reaches
every image only after all of them exist. Pull-request CI checks the 2 compatibility rules a
one-release rollback depends on: the oRPC contract only grows, and each schema stays readable by the
release before.

## Images

Every image builds for `linux/amd64` only, from one commit, and is pinned by digest wherever it is
used. [The image](deployment.md#the-image) describes what each image holds, and the
[code layout](../code-layout.md#images) maps each image to the package it is built from.

| Image        | Repository                           | Stage | Pinned by            | First slice |
| ------------ | ------------------------------------ | ----- | -------------------- | ----------- |
| conversation | `ghcr.io/<owner>/nixie-conversation` | 1     | The sandbox manifest | 1           |
| fetch        | `ghcr.io/<owner>/nixie-fetch`        | 1     | The sandbox manifest | 1           |
| worker       | `ghcr.io/<owner>/nixie-worker`       | 1     | The sandbox manifest | 2           |
| code         | `ghcr.io/<owner>/nixie-code`         | 1     | The sandbox manifest | 8           |
| nixie        | `ghcr.io/<owner>/nixie`              | 2     | The deployment repo  | 1           |
| web          | `ghcr.io/<owner>/nixie-web`          | 3     | The deployment repo  | 1           |
| backup       | `ghcr.io/<owner>/nixie-backup`       | 3     | The deployment repo  | 5           |

An image joins the pipeline in the slice that first builds it, by adding its Dockerfile and its
entry in the stage it belongs to. A sandbox image also adds its kind to the sandbox manifest, and an
image the deployment pins also joins the Renovate group in the deployment repo. The first push of
each image creates its GHCR package as private, so the slice that adds the image sets the package
public once in its package settings. The check-pulls stage of the
[release workflow](#the-release-workflow) fails the release until it does, so a private sandbox
image never reaches a pin.

The Android app ships through its own route in slice 9 and stays outside this pipeline.

## Versioning

One release-please component at the repository root versions the whole repo, so one version covers
every image. The component uses the `simple` release type with the manifest configuration
(`release-please-config.json` and `.release-please-manifest.json`), and tags each release
`v<version>` with no component prefix. The version follows Semantic Versioning, and Conventional
Commits drive the bump: `fix` bumps the patch, `feat` the minor, and a `!` the major. Before 1.0, a
`!` bumps the minor (`bump-minor-pre-major`).

Each image gets the tag `<version>` without the `v`, such as `ghcr.io/<owner>/nixie:0.4.0`. No image
gets `latest`. **Why:** every consumer pins a digest, and a moving tag would invite an unpinned
pull.

release-please runs on every push to `main` with a GitHub App installation token. **Why:** a pull
request that the workflow's `GITHUB_TOKEN` opens triggers no workflow, so the release pull request
would never run the checks that `main`'s ruleset requires.

## The release workflow

The release workflow runs on every push to `main`, in a concurrency group that never cancels a
release in progress. When release-please reports `release_created`, the workflow checks out the
release commit (its `sha` output) and runs these stages:

1. **Sandbox images.** The conversation, fetch and code images build in parallel, and the worker
   image builds after the conversation image, from it by digest. Each pushes by digest only.
2. **The nixie image.** The workflow writes the sandbox manifest from the stage 1 digests into the
   build context, then builds and pushes the nixie image by digest.
3. **Web and backup.** The web and backup images build in parallel and push by digest.
4. **Notes.** The workflow appends the migration list to the GitHub release.
5. **Check pulls.** The workflow pulls every sandbox digest with no credentials, and fails when one
   is private.
6. **Tag.** The workflow adds the version tag to every image's digest without changing the digest:
   the sandbox images first, then backup, web and nixie.

A stage starts only when the stage before it succeeded. **Why:** the nixie image needs the sandbox
digests, and a failed nixie build stops the release before a web image exists that calls an API no
image serves.

The tag stage comes last because Renovate and every reader find a release by its tag. **Why:** the
notes and every image exist before any reader can see the version. A failed release before the tag
stage leaves untagged digests that nothing pins, and re-running the failed jobs resumes from the
stage that failed.

The tag stage is a sequence of separate registry pushes, so a reader can see some images tagged and
not others for a few seconds, or longer when the stage fails. The deployment repo's Renovate
configuration sets a `minimumReleaseAge` of 1 hour on the grouped pins. **Why:** the pin pull
request then never opens on a release whose tags are still landing. The tag stage is idempotent, so
re-running it finishes a partly tagged release with the same digests.

A manual run of the workflow takes a release tag and rebuilds that release from its commit, and
refuses a tag that any image already carries. **Why:** a tagged image may already be pinned, and a
rebuild would give the same tag a different digest.

### The sandbox manifest

The sandbox manifest is a JSON file at a fixed path in the nixie image, mapping each sandbox kind to
its image reference by digest, such as `ghcr.io/<owner>/nixie-fetch@sha256:<digest>`. The workflow
generates it from the stage 1 outputs, and no commit holds it. **Why:** a committed manifest would
need a second commit after the images exist, so the nixie image would come from a different commit
than its sandbox images. [The image](deployment.md#the-image) covers how nixie adds these images to
impd.

### Build settings

Each image builds with Docker Buildx through `docker/build-push-action`, with `provenance: false`
and `sbom: false`. **Why:** Buildx's own attestations wrap the image in an index, and a
single-platform image manifest keeps one digest per image for impd, Renovate and the attestation
subject.

Each Dockerfile pins its base image by digest. The nixie image is built from the release bundle that
the [test builds](../code-layout.md#test-builds) section describes, and the build fails when that
bundle holds a fault point.

Every pull request builds each image without pushing it. **Why:** a broken Dockerfile or a changed
checksum then fails the pull request, never a release.

## Registry publishing

The release workflow pushes to GHCR with its own `GITHUB_TOKEN`, granted `packages: write` and no
broader scope. A package that a workflow pushes with `GITHUB_TOKEN` links to the repository, so the
package inherits the repository's access and its page shows the source.

The sandbox images are public, because impd pulls without credentials and the images hold no
personal data. No image holds a secret, a credential or personal data.

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

## Attestations

Each image gets a GitHub build provenance attestation as soon as its push returns a digest, through
`actions/attest` with `subject-name` set to the repository without a tag, `subject-digest` set to
the pushed digest, and `push-to-registry: true`. The attestation is a Sigstore bundle signed through
the workflow's OIDC token, so no signing key exists to store or rotate. The job holds
`id-token: write` and `attestations: write` for this step.

An attestation records the repository, the workflow file, the commit and the run that built the
digest. `gh attestation verify oci://<image>@sha256:<digest> --repo <owner>/nixie` checks one, and
`--signer-workflow` limits it to the release workflow.

Nothing verifies an attestation yet. A later stage adds verification in 2 places:

- **The pin pull request.** A check in the deployment repo verifies the nixie, web and backup
  digests and every digest in the nixie image's sandbox manifest, before the pin can merge.
- **The deploy script.** The host verifies the same digests after `docker compose pull` and before
  `docker compose up`, as a stage in the [delivery](upgrades.md#delivery) script.

The pin pull request comes first. **Why:** it stops a bad digest before it enters the record of what
runs, and it needs no tooling on the host.

## Compatibility checks

Pull-request CI checks 2 rules against the last release, the newest `v*` tag reachable from the pull
request's base. The release pull request runs them too. Before the first release, both checks pass
with nothing to compare.

### The oRPC contract

The [oRPC contract](deployment.md#the-image) only grows: a release adds procedures and optional
fields, and a removal waits until the release before no longer calls the procedure. CI generates an
OpenAPI document from `libs/contract` at the pull request and at the last release tag, and an
OpenAPI diff fails on any breaking change between them. A breaking change is a removed procedure, a
removed or retyped output field, a new required input field, or a narrowed input type.

A procedure that the last release's contract marks deprecated may be removed. **Why:** the release
that marks it is the one that stops calling it, so the release after it serves no client that calls
it.

### Schema readability

[Upgrades](upgrades.md#migrations) sets the rule: each release keeps its schema readable and
writable by the release before. CI checks it in 2 steps:

1. **Migration lint.** Each migration added since the last release holds only expand statements: a
   new table, a column with a default, or an index. A drop, a rename or a type change fails the
   check unless the migration declares that it breaks readability by the release before.
2. **Rollback test.** CI migrates a database to the last release's schema, fills it through the last
   release's own end-to-end suite, migrates it with the pull request's build and writes to it, then
   starts the last release's nixie image on it and runs that release's suite again.

Both checks compare against one release back, which matches the rollback that
[upgrades](upgrades.md#rolling-back) supports. A deployment whose pin skips a release can roll back
only to a release these checks never compared against, and the open call on
[skipped releases](#open-for-sign-off) covers it.

A migration that declares the break passes the lint, and the rollback test is skipped for it. The
release notes then mark the schema unreadable by the release before.

The rollback test runs when a pull request adds a migration, and always on the release pull request.
**Why:** it pulls the last release's image and runs 2 suites, and a pull request without a migration
leaves the schema unchanged.

### Migrations in the release notes

The notes stage lists every migration file added between the last release tag and this one, each
with its description and whether the release before can read the schema it leaves. The workflow
appends the list to the GitHub release body. **Why:** the list comes from the tree, so it holds
every migration whatever the commit messages say, and Renovate shows the GitHub release body in the
pin pull request.

## Renovate

Renovate configuration in this repo covers the base image digests in the Dockerfiles and the action
SHAs in the workflows. The deployment repo holds the Renovate configuration for its Compose file and
Kubernetes manifests, which groups the nixie, web and backup pins into one pull request, as
[upgrades](upgrades.md#the-pin-and-the-bot) describes.

## Open for sign-off

Each item gives the recommendation the doc above follows, and the alternative.

1. **Image names.** Recommended: flat names in one GHCR namespace, `nixie` for the server and
   `nixie-<image>` for the rest. Alternative: nested names, such as `nixie/web` and
   `nixie/sandbox/fetch`, which GHCR accepts and which group the packages in one prefix.
2. **Visibility of the nixie, web and backup images.** Recommended: public, like the sandbox images.
   The repo is public and the images hold no secret, so a public image costs nothing and the host
   pulls with no credential. Alternative: private, which needs a read-only package token on every
   host and in the deployment repo's CI.
3. **The release token.** Recommended: a GitHub App installed on this repo only, with contents and
   pull-request write, and its ID and private key in repository secrets. Alternative: a fine-grained
   personal access token, which expires and acts as a person.
4. **Dockerfile location.** Recommended: `images/<image>/` at the root, outside the workspace, one
   folder per image with its Dockerfile and binary pin file, because the worker and code images have
   no package. Alternative: each Dockerfile in the package it builds, with the worker and code
   images under `deploy/images/`.
5. **Pinned binary updates.** Recommended: a script that resolves the latest version of each binary,
   checks it against the upstream checksum file and signature, and rewrites the pin file, run by a
   weekly workflow that opens one pull request. Alternative: a Renovate regex manager that bumps the
   version, with the checksum updated by hand on its pull request.
6. **The first version and 1.0.** Recommended: start at `0.1.0`, and cut 1.0 when the first
   deployment runs on its own pins. After 1.0, a major release marks a release that cannot roll back
   to the release before. Alternative: start at `1.0.0` with the first slice 1 release.
7. **Skipped releases.** Recommended: a check in the deployment repo's pin pull request that refuses
   a jump over more than one release when any skipped release removes a procedure, declares a schema
   break or holds a migration the old pin's release cannot read. Renovate rewrites an open pin pull
   request to the newest release, so a jump happens whenever 2 releases land before a merge.
   Alternative: a removal waits 2 releases after its deprecation, which covers a jump of one skipped
   release only.
