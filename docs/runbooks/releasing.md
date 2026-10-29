# Releasing

The [release pipeline](../architecture/deployment/release-pipeline.md) cuts a release when you merge
the release pull request that release-please keeps open on `main`. These are the steps it leaves to
you: the release App it runs with, the package visibility that GHCR sets on a first publish, the npm
package that trusted publishing needs, and the checks and repairs after a run.

## Set up the release App

The release workflow mints its release-please token from a GitHub App, because a pull request that
the workflow's own token opens runs no checks. Do this once, before the first push to `main` that
should open a release pull request.

1. Create a GitHub App with repository permissions Contents read and write and Pull requests read
   and write, and no webhook.
2. Install it on the nixie repository only.
3. Store its client ID and a private key as repository secrets:

   ```bash
   gh secret set RELEASE_APP_CLIENT_ID --repo <owner>/nixie --body <client_id>
   gh secret set RELEASE_APP_PRIVATE_KEY --repo <owner>/nixie < <private_key_file>
   ```

Until both secrets exist, the `release-please` job of every Release run on `main` fails at the token
step, and no release pull request opens.

## Cut a release

1. Merge the release pull request, titled `chore(main): release <version>`. Its checks run like any
   other pull request's, the compatibility checks included.
2. Watch the Release run that the merge starts, found by the merge commit:

   ```bash
   gh run watch "$(gh run list --repo <owner>/nixie --workflow release.yml --commit <merge_commit> --json databaseId --jq '.[0].databaseId')" --repo <owner>/nixie
   ```

   Expect every job to pass, ending with the 2 `npm-package` jobs. Expect the GitHub release to list
   the migrations, the config schema result and the 4 image digests, and to hold the assets
   `release.json`, `config.schema.json` and `definitions-manifest.schema.json`.

## Make a new sandbox image public

GHCR creates each package private on its first push, and impd pulls the sandbox images without
credentials. The first release, and any release that adds a sandbox image, therefore stops at the
`check-pulls` job with `does not pull with no credentials`. No image carries the version yet, so
nothing can pin the release in this state.

1. Open the package settings of each image that the job names, such as
   `https://github.com/users/<owner>/packages/container/nixie-fetch/settings`.
2. Under "Danger Zone", choose "Change visibility", then "Public", and confirm with the package
   name.
3. Re-run the failed jobs of the same run, which keeps the digests the earlier stages pushed:

   ```bash
   gh run rerun <run_id> --repo <owner>/nixie --failed
   ```

The nixie and web packages stay private unless you set them public the same way. A host pulls a
private package only with a GHCR credential that can read it.

## Set up a new npm package

The release publishes each npm package through trusted publishing, and npm sets up a trusted
publisher only on a package that exists. Until then, the package's `npm-package` job passes with
`npm holds no <package_name> yet` and publishes nothing. Do this once for each package the release
publishes, such as `@heynixie/contract`.

1. Publish a placeholder of the package under your own npm login, from an empty folder outside the
   repo:

   ```bash
   echo '{ "name": "<package_name>", "version": "0.0.0" }' > package.json
   npm publish --access public
   ```

   Expect `+ <package_name>@0.0.0`.

2. On npmjs.com, open the package's settings, and under "Trusted Publisher" choose GitHub Actions,
   with user `<owner>`, repository `nixie` and workflow filename `release.yml`.
3. Re-run the package's `npm-package` job of the last Release run, found with
   `gh run view <run_id> --repo <owner>/nixie --json jobs`:

   ```bash
   gh run rerun <run_id> --repo <owner>/nixie --job <job_id>
   ```

   Expect the job's log to end with `+ <package_name>@<version>`.

## Check an attestation

Each image digest the release pushes has a build provenance attestation. Check one with the digest
from the release notes:

```bash
gh attestation verify oci://ghcr.io/<owner>/nixie@<digest> --repo <owner>/nixie \
  --signer-workflow <owner>/nixie/.github/workflows/release-image.yml
```

Expect `Verification succeeded!` and the release commit in the output. A private package needs
`gh auth` with a token that can read packages.

## Repair a failed release

- **A stage failed.** Re-run the failed jobs of the run, as in the visibility steps. The run resumes
  from the stage that failed, and a partly tagged release finishes with the same digests.
- **The run is gone, its digests are lost, or it stopped because release-please tagged another
  commit.** Start a manual run on the tag, so the attestations name the tag's commit. It rebuilds
  every image from the tag's commit, and it refuses when any image already carries the version,
  because a deployment may pin it:

  ```bash
  gh workflow run release.yml --repo <owner>/nixie --ref v<version>
  ```

- **The tag stage tagged some images, and its run can no longer re-run.** A manual run refuses this
  release, because an image carries the version. Finish the tags from the digests in the release
  notes, in the order the tag stage uses, from a checkout of the repo. The `gh` token needs the
  `write:packages` scope:

  ```bash
  gh auth token | docker login ghcr.io -u <owner> --password-stdin
  .github/scripts/tag-images.sh <version> <conversation_ref> <fetch_ref> <web_ref> <nixie_ref>
  ```

  Each ref is a `ghcr.io/<owner>/<image>@sha256:<digest>` line from the release notes. Expect one
  `tagged` line per image. A tag already on its digest stays as it is.
