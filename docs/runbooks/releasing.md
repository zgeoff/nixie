# Releasing

The [release pipeline](../architecture/deployment/release-pipeline.md) cuts a release when you merge
the release pull request that release-please keeps open on `main`. These are the steps it leaves to
you: the release App it runs with, the package visibility that GHCR sets on a first publish, and the
checks and repairs after a run.

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
2. Watch the Release run that the merge starts:

   ```bash
   gh run watch "$(gh run list --repo <owner>/nixie --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --repo <owner>/nixie
   ```

   Expect every job to pass, ending with `tag`, and the GitHub release to list the migrations and
   the 4 image digests.

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
