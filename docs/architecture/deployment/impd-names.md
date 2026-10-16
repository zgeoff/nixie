# Names in impd

nixie keeps every imp, image and secret it uses in impd under a name it derives, and a deployment
grants nixie's impd token, adds images and stores secrets by those names. The names follow fixed
rules, so a deployment's tooling and impd's own docs can rely on the rules here instead of on a copy
of nixie's code. The rules are a contract: a release that changes one of them is a breaking change
for every deployment.

[Sandboxes](../connectors/sandboxes.md) covers the imp adapter that uses the names,
[model profiles](../core/model-profiles.md#credentials) covers the credentials behind the model
secrets, and [the release pipeline](release-pipeline.md) covers the sandbox images.

## Imps

Each sandbox is one imp, named `nixie-` and 24 lowercase hex digits from a random UUID, such as
`nixie-3f9a0c1b7d2e4f60a1b2c3d4`. The name is the sandbox's own ID, so it never repeats, and it fits
within impd's limit on an imp name. Every imp nixie makes starts with `nixie-`, so a deployment
scopes nixie's impd token to the pattern `nixie-*`, and the token reaches no imp of any other work
on the same impd.

Other work on the same impd keeps a prefix of its own that does not start with `nixie-`, such as
`harness-` for an agent harness's imps. Its token's pattern then matches none of nixie's imps, and
nixie's pattern matches none of its imps.

## Images

Each sandbox image is named `nixie-<kind>-<12 hex>`, where the kind is a sandbox kind in the sandbox
manifest, such as `conversation` or `fetch`, and the hex digits are the first 12 of the image's
SHA-256 digest. A release's images therefore sit beside the previous release's in impd, and a
changed digest changes the name a sandbox's spec gives, which replaces the sandbox. Every image name
starts with `nixie-`, so it falls within the token's pattern `nixie-*`.

`nixie sandbox-manifest` prints each kind's image with its ref and its name
([host commands](host-commands.md)), so a deployment adds an image under the name the command
prints. A token that impd lets add images under a ref prefix lets nixie add them itself at start. At
start, nixie refuses an image name that impd holds at another digest, because a spec that names it
would run an image the manifest never pinned.

The sandbox images stay publicly pullable, because impd pulls an image with no registry credentials.
GHCR creates each package private, so each sandbox image's package is set public once, and the
release fails its pull check until it is
([publishing](release-pipeline.md#build-settings-and-publishing)). The images hold no personal data.

## Model secrets

A sandbox reaches its model through a secret that impd's broker injects, named
`model-<profile>-<16 hex>`. The profile is the model profile's ID, and the hex digits are the first
16 of the SHA-256 of the profile's auth header (`bearer` or `x-api-key`), the model host and the
credential, each on its own line. A rotated credential therefore gets a new name, and a sandbox
granted the old secret keeps working until it is replaced.

A token scoped to `nixie-*` cannot store a secret, because a secret is host-wide in impd. The
deployment stores each model secret under its derived name and lists those names as the secrets
nixie's token may grant.
