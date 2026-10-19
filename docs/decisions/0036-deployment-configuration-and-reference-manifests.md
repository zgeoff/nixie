# 0036: Deployment configuration and reference manifests

- Date: 2026-10-10
- Updated: 2026-10-18
- Status: decided
- Architecture: [deployment configuration](../architecture/deployment/configuration.md),
  [Kubernetes](../architecture/deployment/kubernetes.md),
  [code layout](../architecture/code-layout.md#the-folders)

nixie reads its deployment settings from one YAML file, validated by a zod schema at start. The file
holds the model profiles, the role map, the internal address ranges, the definitions source, the web
fetch limits and every other setting a design leaves to the deployment. It never holds a secret:
secrets stay in the encrypted secrets file. A JSON Schema generated from the zod schema documents
the file, and each release publishes it.

nixie ships generic reference Kubernetes manifests in `deploy/kubernetes/`, beside the Compose
recipe in `deploy/compose/`. They cover the StatefulSet, the web Deployment, the ingress with its
`/rpc` rule, the Secrets, and impd beside the cluster, and hold no host, cloud or private network
detail. A deployment repo keeps its own version of them.

## Why

- One file read at start gives every part one version of the settings, and a pull request in the
  deployment repo shows every change.
- A zod schema refuses a bad file before any part starts, and the same schema types the settings in
  code.
- Keeping secrets out of the file lets the file stay in plain text and in review.
- Reference manifests give a new deployment a starting point, while the public repo stays free of
  private detail.

## Alternatives

- **Environment variables.** Nested settings such as profiles and address ranges fit them poorly,
  and a variable in the container's configuration is easy to change without review.
- **Settings in the secrets file.** Every settings change would need a decrypt and a re-encrypt, and
  review would see only ciphertext.
- **Manifests only in the deployment repo.** A new deployment would have no shared starting point,
  and each deployment would rediscover the single-writer shape.

## Consequences

- A setting a later slice adds joins the schema in that slice, and nixie refuses an unknown key.
- A change to a reference manifest reaches a deployment only when its deployment repo copies it.

## Changes

- 2026-10-12: the live checks left the repo, so the manifests no longer give them a target.
- 2026-10-18: the generated JSON Schema ships with each release instead of in `docs/reference/`, and
  the record links the configuration and Kubernetes docs in the architecture docs.
