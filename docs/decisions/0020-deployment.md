# 0020: Deployment and definitions

- Date: 2026-10-08
- Status: decided
- Research:
  [deployment notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.6-notes/deployment.md),
  [2.4 to 2.6 landscape](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.4-2.6-data-channels-connectors.md#deployment)

Running nixie and defining nixie are separate. An owner's definitions, such as persona, jobs and the
policy seed, live in a private repo of their own. Running nixie, such as the image version, the
infrastructure, secrets and backups, lives wherever the owner deploys it.

nixie reads its definitions through a definitions source, an adapter. A git repo, a local path and
bucket storage are all valid sources, and the choice is independent of how nixie is deployed.

## Seeding

The definitions repo seeds the database, and the database is the one place the owner looks, through
the client or the live view. Each rule records its source: seeded from a commit, or created at
runtime with the ID of the approval that created it, under [0013](./0013-definition-versioning.md).

- **A seeded rule that changes in the repo** updates in the database at the next seed, unless it was
  edited at runtime. A runtime edit marks it overridden, and the conflict shows in the client for
  the owner to resolve.
- **A rule deleted from the repo** is removed at the next seed. Removing an allow rule only narrows,
  so it applies at once with a record, under [0005](./0005-effects-and-taint.md). Removing a deny
  rule widens, so it follows the next case.
- **A repo change that widens the rules,** such as a looser allow rule or a removed deny rule,
  applies only after the owner confirms it in the client. Widening is in the always-ask set, and
  merging a pull request is not an approval.

nixie can export runtime rules to the definitions repo as a pull request. Once the owner merges it,
the next seed marks those rules as seeded.

## Viable deployment models

- **Docker Compose on one host:** the recommended path for most owners. It uses an OCI image,
  upgrades as pull requests from a dependency bot with a database backup before each migration,
  secrets encrypted with sops and age, and access over Tailscale with nixie bound to loopback.
  Renovate's docker-compose manager bumps image tags in a Compose file
  ([docker-compose manager](https://docs.renovatebot.com/modules/manager/docker-compose/),
  2026-10-08).
- **Kubernetes managed with Pulumi:** the owner's own setup, which the owner tests in practice. The
  infrastructure repo runs nixie, and the definitions repo stays separate.

## Why

- nixie opens pull requests to its definitions repo when it exports rules, and should not need write
  access to an infrastructure repo to change a rule.
- Definitions change often and infrastructure rarely, so separate repos keep each history readable.
- A separate definitions repo is the same artifact for every owner, so the owner's own Kubernetes
  setup tests the portable model.
- One place to look for rules answers "why did nixie allow this?" without comparing the repo and the
  database.
- Confirming a widening in the client keeps someone with access to the owner's git host from
  widening nixie's rules.

## Alternatives

- **One deployment repo that pins the version and holds the definitions,** as the research
  recommended. It suits Compose, and puts definitions next to infrastructure for other setups.
- **The repo as the baseline and the database as a runtime layer on top.** It leaves 2 places to
  look when the owner asks why nixie allowed an action.

## Consequences

- The definitions repo is private. The owner's own repo lives on the owner's git host.
- Memory, conversations and the event log never go in the definitions repo.
- The definitions source adapter joins the interfaces in [0016](./0016-own-interfaces.md) for Phase
  3 to sketch.
