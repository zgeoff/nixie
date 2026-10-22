# The release pipeline

A nixie release is one version, cut from one commit on `main`, that publishes every nixie image to
GitHub Container Registry (GHCR). release-please opens a release pull request from the Conventional
Commits since the last release, and merging it creates the `v<version>` tag and the GitHub release.
The release workflow then builds the conversation and fetch images, the nixie image with their
digests inside it, and the web image, in that order. Each image gets a build provenance attestation
as it is pushed, and the version tag reaches every image only after all of them exist. The release
then publishes `release.json` and `config.schema.json`, the contract a deployment reads in place of
nixie's tree. Pull-request CI checks the 2 compatibility rules that a one-release rollback depends
on: the oRPC contract only grows, and each migration keeps the schema readable by the release
before. A third check fails a config schema change that can refuse a released `config.yaml`, unless
the pull request title marks it breaking.

[The server](server.md) covers how nixie reads the sandbox manifest that the pipeline writes into
the nixie image, and [the database](../core/database.md#migrations) covers migrations and the oldest
reader. [Releasing](../../runbooks/releasing.md) holds the steps the pipeline leaves to you. The
[release pipeline design](../../design/platform/deployment/release-pipeline.md) covers the images,
checks and verification that later slices add.

## Images and versions

Each image builds for `linux/amd64` only, from the Dockerfile in the package it ships, and lives in
one flat GHCR namespace: `nixie` for the server and `nixie-<image>` for the conversation, fetch and
web images. One release-please component at the repository root versions the whole repo, so one
version covers every image. Conventional Commits drive the bump under Semantic Versioning, the first
release is `0.1.0`, and before 1.0 a breaking change bumps the minor version. The release pull
request bumps the version in the server's source as well as in the manifest, so the server knows the
release it runs without reading a tag.

Each image gets the tag `<version>` without the `v`, such as `nixie:0.4.0`, and no image gets
`latest`, because every consumer pins a digest and a moving tag would invite an unpinned pull.

release-please runs with a GitHub App installation token rather than the workflow's own token. A
pull request that the workflow token opens runs no workflow, so the release pull request would never
run the checks that `main` requires.

## The release workflow

The release workflow runs on every push to `main`, in a concurrency group that never cancels a
release in progress. When release-please reports a new release, the workflow checks out the release
commit and runs one job per stage, each after the stage before it succeeds:

```mermaid
flowchart LR
  rp[release-please] --> conv[conversation image]
  rp --> fetch[fetch image]
  conv --> nixie[nixie image]
  fetch --> nixie
  nixie --> web[web image]
  web --> notes[release notes]
  notes --> pulls[check pulls]
  pulls --> tag[tag]
  tag --> assets[assets]
  assets --> k8s[Kubernetes component]
```

1. **Sandbox images.** The conversation and fetch images build in parallel, and each pushes by
   digest only.
2. **The nixie image.** The workflow builds the sandbox manifest from the stage 1 digests, writes it
   into the build context, then builds and pushes the nixie image by digest.
3. **The web image.** The web image builds and pushes by digest.
4. **Notes.** The workflow adds the migration list, the config schema result and every image digest
   to the GitHub release.
5. **Check pulls.** The workflow pulls each sandbox image with no credentials, as impd does, and
   fails while a sandbox package is private.
6. **Tag.** The workflow gives the version tag to each image's digest: the sandbox images first,
   then web, then nixie.
7. **Assets.** The workflow uploads the committed `config.schema.json` and
   `definitions-manifest.schema.json` to the GitHub release, then builds and uploads `release.json`,
   replacing the assets of an earlier attempt. `release.json` goes last, so a reader that finds it
   finds the schema it points to.
8. **Kubernetes component.** The workflow publishes the
   [Pulumi component](kubernetes.md#the-pulumi-component) to npm at the release's version, with
   npm's provenance, and skips a version that npm holds already.

The nixie image needs the sandbox digests, so the sandbox images go first. A failed nixie build
stops the release before a web image exists that calls an API no image serves. The tag stage comes
last because Renovate and every other reader find a release by its tag, so the notes and every image
exist before a reader can see the version. A failure before the tag stage leaves untagged digests
that nothing pins, and re-running the failed jobs resumes from the stage that failed with the
digests the earlier stages recorded.

The tag stage copies each digest's manifest to the tag byte for byte, so the tag names the digest
the build pushed. It refuses before it tags anything when a repository already gives the version to
another digest, because a deployment may pin that tag. A tag already on its own digest stays as it
is, so a re-run finishes a partly tagged release. A manual run of the workflow starts on a release
tag, because each attestation names the commit of the run that made it. The manual run rebuilds the
release from that commit and refuses a version that any image already carries.

The sandbox manifest maps each sandbox kind to its image by digest, and no commit holds it. A
committed manifest would need a second commit after the images exist, so the nixie image would come
from a different commit than its sandbox images.

## The release contract

A deployment reads two assets of the GitHub release and nothing else of nixie's: no copy of a file
from the repo, and no parse of the release notes. Each release publishes both, and their shape is a
contract that changes only in step with the readers.

- **`release.json`** holds the version, its tag and its commit; the server and web images and the
  sandbox images, each by version tag and digest; the migrations the release adds since the release
  before, and whether that release reads the schema they leave; and the config schema result. Its
  `format` rises only on a change that a reader of the format before would misread, so an added
  field leaves it as it is.
- **`config.schema.json`** is the JSON Schema of `config.yaml`, which a deployment checks its
  configuration against before it rolls out. The server's configuration schema generates it, and a
  test fails when the committed file differs, so every release tag holds the schema of its own
  build. It describes what a release build accepts, so it refuses the test sandbox, and a test
  checks that it agrees with the release build's own validator. It covers every rule on a single key
  and leaves out the rules that span keys, such as a role that points at a missing profile, which
  nixie refuses at start. Its time zones are the canonical names, so it refuses an alias that nixie
  reads and never passes a zone that nixie refuses.

A definitions repo, not a deployment, reads `definitions-manifest.schema.json`, the JSON Schema of
its `nixie.yaml`, which [the definitions format](../core/definitions.md#the-definitions-format)
covers.

The assets stage runs last because a deployment that finds `release.json` pins the images it lists,
so every image must carry its version tag first. The release notes keep the same facts for a person,
and a reader that parses them is outside the contract.

## Build settings and publishing

Every build runs Docker Buildx with its own provenance and SBOM attestations off. Buildx would
otherwise wrap the image in an index, and a single image manifest keeps one digest per image for
impd, Renovate and the attestation subject.

The workflow pushes with its own token, granted package write and no broader scope, so each package
links to the repository and its page shows the source. GHCR creates each package private on its
first push. The sandbox packages must then be set public once in their package settings, because
impd pulls without credentials, and the check-pulls stage fails the release until they are.

The Images workflow rehearses the image stages against a registry that lives only for the job. It
runs on each push to main, and on each pull request that changes a file the images or the stages
read. It builds all 4 images, writes the sandbox manifest, checks that the nixie image carries it,
pulls the sandbox images with no credentials, and tags every image twice to prove the tag stage
keeps each digest and repeats safely. It then builds `release.json` from those digests, as the
assets stage does, and checks that each image it names resolves its tag to its digest. It runs the
upload script against a stand-in for the GitHub CLI, which proves the schema goes up before
`release.json` and that a failed schema upload stops the run before `release.json` goes out. A
broken Dockerfile or release script therefore fails the pull request, never a release.

The workspace keeps the component's package at version 0.0.0, so a release pull request changes no
version that the lockfile records. The publish writes the release's version into the package for the
pack, and Bun packs it, because Bun turns each `catalog:` version into the version it pins. npm then
publishes the tarball through trusted publishing, which ties the package to the release workflow by
the workflow's own token, so the repo holds no npm token. The K8s package workflow rehearses the
publish on each push to main, and on each pull request that changes a file the package or the
publish reads: it packs the component, checks that the tarball holds no workspace version and no
test file, and runs npm's publish as a dry run.

## Attestations

The release workflow attests each image's build provenance as soon as its push returns a digest,
with the repository as the subject name and the attestation pushed beside the image. The attestation
is a Sigstore bundle signed through the workflow's OIDC token, so no signing key exists to store or
rotate. It records the repository, the workflow file, the commit and the run that built the digest,
and `gh attestation verify oci://<image>@<digest> --repo <owner>/nixie` checks one. Nothing verifies
an attestation at deploy yet.

## Compatibility checks

Pull-request CI compares each pull request with the last release, the newest `v*` tag reachable from
its base. Before the first release, CI skips the contract check, and the migration check lists every
migration and refuses none. A pull request that changes neither the contract nor the database
library skips both checks, and each push to main checks the pushed commit against the newest `v*`
tag reachable from it.

The contract check generates an OpenAPI document from the oRPC contract and diffs it with oasdiff
against the copy the release tag holds. The repo commits that document beside the contract, and a
test fails when the two differ, so every release tag holds the document of its own contract. oasdiff
fails on a removed procedure, a removed or retyped output field, a new required input field or a
narrowed input type. A procedure that the last release marks deprecated may go, because the release
that marked it stopped calling it.

A planned break passes the contract check when `libs/contract/accepted-breaks.txt` names it. A break
belongs there only when its Linear issue plans it and says why a client of the last release still
works against the new contract. A new value in a response enum is the common case. The check accepts
an error only when one line ends with its method, its path and the whole message oasdiff prints for
it, exactly and in the same case, so one line accepts one break and every other break in the same
pull request still fails. The check matches the lines itself, because oasdiff's own list of ignored
errors ignores case, and a line for `self_note` would then accept `SELF_NOTE` too. A line copies the
message from the failed check and starts with the Linear issue that plans the break:

```text
GEO-556: POST /memory/listProposals added the new `self_note` enum value to the `proposals/items/reason` response property for the response status `200`
```

The pull request that makes the break adds its line, so the review sees both. A line stops matching
once a release ships the break, because the check then compares against that release, and the first
pull request after that release deletes it. An extensible enum would accept every later value too,
so the contract keeps each enum closed and lists each planned value. The compatibility workflow runs
a rehearsal on two small documents, which proves that a listed break passes and that an unlisted
break beside it fails.

The migration check installs the last release's own tree and has it report its migration names and
the schema they build. It then runs the released migrations of the pull request's build on a scratch
database, and fails when they build any table, index or trigger differently, or when the build
renames, removes or reorders a released migration. An edited released migration would leave a new
database with a schema that no upgraded database holds.

The check then records each statement of every migration added since the release. A build that keeps
the schema readable by the release before adds only what an insert from that release still
satisfies: a new table, a non-unique index, and a column that has a default or allows null and holds
no check. A unique index, a constrained column or a trigger passes only on a table the same release
creates, because the release before never writes to it. Its log reset drops every trigger the schema
holds and creates each one again, so a new trigger never blocks the reset. A unique index also
passes on columns the same release adds without a default, and an update passes when it sets only
such columns, because the release before leaves them null and a unique index admits any number of
nulls. That update is how a migration backfills a column it adds. A read passes too, because it
changes nothing. The check fails on any other statement. A build declares that it breaks readability
by raising its oldest reader past the last release's schema version, and the check then allows every
statement.

The release notes stage runs the same check against the release before, and adds its result to the
GitHub release: each added migration with its schema version, and whether the release before reads
the schema it leaves. The list comes from the code, so it holds every migration whatever the commit
messages say.

The config schema check lists each change between two copies of `config.schema.json` that can refuse
a `config.yaml` the older copy accepts: a removed or newly required key, a narrower type, bound or
value list, or a new pattern. A change it cannot prove harmless counts as breaking, so the list can
hold a false alarm but never misses a break. On a pull request, the check compares with the copy on
the pull request's base, so each pull request answers only for the change it adds. A pull request
with a breaking change fails until its title marks a breaking change with `!`, because the squash
merge makes the title the commit header, and release-please then lists the commit under the
changelog's breaking changes. A title edit runs the check again. The release notes stage compares
with the copy the last release tag holds, adds the list to the GitHub release, and carries it in
`release.json`, so a break that merged with its marker never blocks the release.
