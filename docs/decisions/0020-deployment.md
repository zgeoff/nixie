# 0020: Deployment and definitions

- Date: 2026-10-08
- Status: decided
- Design: [deployment](../design/deployment/deployment.md),
  [definitions source](../design/connectors/definitions-source.md)
- Research:
  [deployment notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.6-notes/deployment.md)

Running nixie and defining nixie are separate, across 3 repos:

- **The nixie repo** holds the platform: behaviour, contracts, adapters and reference
  implementations.
- **A definitions repo,** private, holds your persona, prompts, jobs and policy seed.
- **A deployment repo** holds the image version, infrastructure, secrets, backups and backend
  settings, such as which S3-compatible storage holds backups.

nixie reads its definitions through the definitions source from [0016](./0016-own-interfaces.md). A
git repo, a local path and bucket storage are all valid sources, and the choice is independent of
how nixie is deployed.

## Seeding

The definitions seed the database, and the database is the one place to look, through the client or
the live view. Each rule records its source: seeded from a commit, or created at runtime with the ID
of the approval that created it, under [0013](./0013-definition-versioning.md).

- **A seeded rule that changes in the repo** updates in the database at the next seed, unless it was
  edited at runtime. A runtime edit marks it overridden, and the conflict shows in the client to
  resolve.
- **A rule deleted from the repo** is removed at the next seed. Removing an allow rule only narrows,
  so it applies at once with a record, under [0005](./0005-effects-and-taint.md). Removing a deny
  rule widens, so it follows the next case.
- **A repo change that widens the rules,** such as a looser allow rule or a removed deny rule,
  applies only after you confirm it in the client. Widening is in the always-ask set, and merging a
  pull request is not an approval.

nixie can export runtime rules to the definitions repo as a pull request in YAML, the rule format
from [0028](./0028-policy-design.md). Once you merge it, the next seed marks those rules as seeded.

## Deployment models

- **Kubernetes:** one nixie replica in a StatefulSet, with impd on the node outside the cluster. It
  suits a deployment that runs for good.
- **Docker Compose:** the reference recipe beside an imp host, for local and development use and for
  any single host.

Both models are supported from the first build, with the same pinned images, the same separate
definitions repo, one encrypted secrets file that nixie decrypts in its own process, upgrades as
pull requests that bump the image digest, a database copy before each migration, backups under
[0032](./0032-offsite-backups-and-replication.md), and access over a private network such as
Tailscale, with HTTPS on a fixed name.

## Why

- nixie opens pull requests to the definitions repo when it exports rules, and needs no write access
  to an infrastructure repo to change a rule.
- Definitions change often and infrastructure rarely, so separate repos keep each history readable.
- A separate definitions repo is the same artifact for every deployment, so any deployment model
  tests the portable one.
- One place to look for rules answers "why did nixie allow this?" without comparing the repo and the
  database.
- Confirming a widening in the client keeps someone with access to your git host from widening
  nixie's rules.

## Alternatives

- **Compose first, Kubernetes later.** It keeps the first build on one host, and leaves a cluster
  deployment untested until after the first build.
- **One deployment repo that pins the version and holds the definitions.** It suits Compose, and
  puts definitions next to infrastructure for other setups.
- **The repo as the baseline and the database as a runtime layer on top.** It leaves 2 places to
  look when you ask why nixie allowed an action.

## Consequences

- Memory, conversations and the event log never go in the definitions repo.
