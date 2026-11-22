# Deployment configuration

nixie reads its deployment configuration from one YAML file when a process starts. A zod schema
validates the file, and nixie refuses to start on a file that fails it. The file holds settings,
never secrets: every secret stays in nixie's encrypted secrets file, which
[the server](server.md#configuration-and-secrets) decrypts at start. A deployment repo keeps the
file beside its manifests or its Compose file, and changes it by pull request like the pinned image
digests.

## What the file holds

The file holds every setting that a part of nixie leaves to the deployment, in one section per part.
Each part's doc owns the meaning of its own settings, and the file only carries them:

- where the server keeps its data, listens and finds the secrets file, and the lowest level of event
  it logs
- the user's name and pronouns, and the names the user calls the agent by
- the hashes of the API's [read-only tokens](../channels/api.md#read-only-tokens)
- the [model profiles and the role map](../core/model-profiles.md#the-role-map), with each profile's
  [harness](../core/model-profiles.md#harnesses) and its credential as a reference, and when
  [compaction](../core/compaction.md) runs
- the sandbox adapter, and for imp, impd's address and the address ranges for
  [public egress](../connectors/sandboxes.md#the-imp-adapter)
- the [definitions](../core/definitions.md) source, how often nixie probes it, and the GitHub repo
  that [skills nixie wrote](../core/definitions.md#the-export-to-the-definitions-repo) export to
- the [web fetch](../connectors/web-fetch.md) limits, the fetches one fetch sandbox serves, and the
  [time](../connectors/time.md) tool's default zone
- the [search](../connectors/search.md) tool's daily call cap, its API URL and its key as a
  reference
- the [images](../connectors/images.md) profiles: each provider, model, price for each size and key
  as a reference
- the [model gateway](../policy/model-gateway.md#how-nixie-uses-the-gateway) that counts every model
  request, which `spendStop` names, and the model limits it sets: the day and the month
- the shortest gap between two fires of a recurring [reminder](../core/reminders.md#tools)
- the task and action [claim pool](../core/leases-and-recovery.md#claim-pools) sizes
- whether nixie stages [backups](backups.md), and how often
- the tuning of [memory in context](../memory/context.md)
- the limits of the [notebook](../memory/notebook.md#the-indexes): the characters of a body, the
  active notes, and how many links must repeat a reason before the check reports it
- `forget_notices`, which turns the line that the events block shows for each kind of forget on or
  off: `forget_notices: false` turns every kind off, and the `note` key turns the note line off

The model profiles and the definitions source have no defaults, so the file always sets them. The
imp section is required when the sandbox adapter is imp, which a release build always runs. Every
other setting the file leaves out takes the default its part names.

## The schema

`apps/server` owns the schema, composed from one zod schema per section. The package that reads a
section owns that section's schema: a module for its own settings, the imp adapter for the imp
section, and the server for its own, the user's and the sandbox adapter's. Each package therefore
validates the settings it reads, and one root schema still refuses the file as a whole before any
part starts. Every object in the schema is strict, so an editor flags an unknown key. The loader
removes each unknown key and parses again, and the server logs a `config.unknown_key` warning that
names the key's path at start. A newer release's key therefore never stops an older release from
starting. The cost: a mistyped key passes with the default of the setting it meant, and only the
warning shows it. A key inside a union branch that the schema reports as one invalid union still
refuses the file. The error lists the path of each other fault it refuses.

A setting that names a secret holds a reference of the form `deployment:<name>`, which names an
entry in the secrets file. A model profile's credential and the search key accept only that form.
The user's name and each pronoun accept either a reference or the value, so a deployment whose
configuration lives in a public repo keeps them in the secrets file. The server resolves each
reference once the secrets load, and refuses to start when the secrets file lacks the entry, so
nixie never shows the model a reference in place of a name or a pronoun.

The server generates a JSON Schema from the zod schema and commits it as `config.schema.json`, and a
test fails when the committed file differs. Each release publishes that file
([the release contract](release-pipeline.md#the-release-contract)), and a pull request whose change
to it could refuse a released `config.yaml` fails until its title marks a breaking change
([compatibility checks](release-pipeline.md#compatibility-checks)). A deployment checks its file
against the schema before it rolls out.

## Mounting the file

nixie reads the file from `/etc/nixie/config.yaml`, mounted read-only, and a command-line flag
overrides the path:

- **Compose** bind-mounts the file from the deployment repo's checkout into the server and into the
  one-off host commands.
- **Kubernetes** mounts it from a ConfigMap that the deployment repo's manifests define, as
  [Kubernetes](kubernetes.md) describes.

nixie reads the file once at start. A change reaches nixie at its next start, which a deploy of the
changed file causes. A setting that changed mid-run would apply to some steps and not others, and a
restart puts every part on one version of the file.
