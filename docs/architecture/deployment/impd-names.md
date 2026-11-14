# Names in impd

nixie keeps every imp, image and secret it uses in impd under a name it derives, and a deployment
grants nixie's impd token, adds images and stores secrets by those names. Every name nixie derives
starts with `nixie-`, so a deployment tells nixie's imps, images and secrets apart from those of any
other work on the same impd by the prefix alone. The names follow fixed rules, so a deployment's
tooling and impd's own docs can rely on the rules here instead of on a copy of nixie's code. The
rules are a contract: a release that changes one of them is a breaking change for every deployment.

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

Each sandbox image is named `nixie-<key>-<12 hex>`, where the key is an image key of the sandbox
manifest, such as `conversation` or `fetch`, and the hex digits are the first 12 of the image's
SHA-256 digest. A release's images therefore sit beside the previous release's in impd, and a
changed digest changes the name a sandbox's spec gives, which replaces the sandbox. Every image name
starts with `nixie-`, so it falls within the token's pattern `nixie-*`.

`nixie sandbox-manifest` prints each image key's image with its ref and its name
([host commands](host-commands.md)), so a deployment adds an image under the name the command
prints. A token that impd lets add images under a ref prefix lets nixie add them itself at start. At
start, nixie refuses an image name that impd holds at another digest, because a spec that names it
would run an image the manifest never pinned.

The sandbox images stay publicly pullable, because impd pulls an image with no registry credentials.
GHCR creates each package private, so each sandbox image's package is set public once, and the
release fails its pull check until the package is public
([publishing](release-pipeline.md#build-settings-and-publishing)). The images hold no personal data.

## Model secrets

A sandbox reaches its model through a secret that impd's broker adds to each request to the model
host. nixie names the secret `nixie-model-<19 hex>`, where the hex digits are the first 19 of the
SHA-256 of these lines, joined by newlines with none after the last:

1. the model profile's ID;
2. its auth header, `bearer` or `x-api-key`;
3. the model host;
4. the credential, only when nixie's secrets file holds it.

impd caps a name at 31 characters, and a profile ID has no cap, so the profile goes into the digest
instead of the name. [Model profiles](../core/model-profiles.md#credentials) covers who holds the
credential in each case.

A secret in impd belongs to the whole host, so a token scoped to the imps `nixie-*` cannot add a
secret. A deployment whose token has that scope holds each credential itself, and leaves it out of
nixie's secrets file. Its operator adds each model secret with impd's root access, under the name
whose digest leaves out the credential, and puts those names in the token's list of secrets it can
grant. To rotate a credential, the operator replaces each secret's value under the same name, and
changes nothing in nixie or its token.

When impd lacks one of those secrets, nixie refuses to create the sandbox that needs it, and names
the missing secret in the error.

This command prints the name of the secret for the profile `opus` on Anthropic's endpoint with a
bearer header, when the deployment holds the credential:

```bash
printf 'opus\nbearer\napi.anthropic.com' | sha256sum | cut -c1-19 | sed 's/^/nixie-model-/'
```

Expect: `nixie-model-528d8dae09a6d4f1e0e`.
