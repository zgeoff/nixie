# Deployment configuration

- Decisions: [0020](../../../decisions/0020-deployment.md),
  [0036](../../../decisions/0036-deployment-configuration-and-reference-manifests.md)

nixie reads its deployment configuration from one YAML file at start. A zod schema validates the
file, and nixie refuses to start on a file that fails it. The file holds settings, never secrets:
every secret stays in nixie's encrypted secrets file under [secrets](deployment.md#secrets). Your
deployment repo keeps the file beside its manifests or its Compose file, and changes it by pull
request like the pinned digests.

## What the file holds

The file holds every setting that a design leaves to the deployment. Each design owns the meaning of
its own settings, and the file only carries them:

- the [model profiles and the role map](../core/models.md#configuration), with each profile's
  credential as a reference
- the internal address ranges and host addresses for
  [public egress](../connectors/sandbox-adapter.md#public-egress)
- the [definitions source](../connectors/definitions-source.md) and its probe interval
- the [web fetch](../connectors/connector.md#limits-and-the-result) limits and the fetch sandbox's
  replacement count
- the [runner pool](../core/actions.md#runner-pools) sizes
- any overrides of the [budget defaults](../policy/budgets.md#model-cost)

A setting the file leaves out takes the default its design names. A setting that a later slice
builds joins the schema in that slice, and nixie refuses an unknown key, so a typo never passes as a
default. The backup sidecar reads its own settings, which
[backup and restore](backup-and-restore.md) covers.

## The schema

`apps/server` owns the schema, composed from one zod schema per module for that module's own
section. **Why:** each module validates the settings it reads, and one root schema still refuses the
file as a whole before any part starts. nixie generates a JSON schema from the zod schema into
`docs/reference/`, so an editor can check the file before a deploy.

A credential reference of the form `deployment:<name>` names an entry in the secrets file, and nixie
refuses one whose entry the secrets file lacks. A reference to another backend resolves through that
backend.

## Mounting the file

nixie reads the file from `/etc/nixie/config.yaml`, mounted read-only:

- **Compose** bind-mounts the file from the deployment repo's checkout.
- **Kubernetes** mounts it from a ConfigMap that the deployment repo's manifests define.

nixie reads the file once at start. A change reaches nixie at its next start, which a deploy of the
changed file causes. **Why:** a setting that changed mid-run would apply to some steps and not
others, and a restart puts every part on one version of the file.
