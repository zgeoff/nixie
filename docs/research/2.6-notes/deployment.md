# Deployment repo and infrastructure

Report: 2.6

Sources were fetched on 2026-10-08 unless a different date is given with the source.

Each owner runs nixie from a private deployment repo: the persona, jobs and policy that "Behaviour
is data" requires, a pinned nixie version, and references to secrets. Comparable self-hosted
projects split along one line: OpenClaw and Hermes keep everything in one home directory and update
in place with their own command, while Home Assistant, n8n and Immich ship a container image that
the owner pins. A deployment repo fits the second pattern best: the repo pins an image, a dependency
bot opens a pull request for each release, and an upgrade is a merge. Secrets work best as
references in the repo that resolve on the host, through sops with age or through a secrets manager.
The channels chosen in track 2.5 decide whether a deployment needs any inbound route: Telegram long
polling, Slack Socket Mode and the Discord Gateway need none, and a tailnet then covers the
dashboard and approvals.

## Comparable projects

| Project        | Version         | Install                              | Config                               | Secrets                                                | Update                                    |
| -------------- | --------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------------ | ----------------------------------------- |
| OpenClaw       | 2026.9.8        | Script, npm, Docker, Nix, Kubernetes | `~/.openclaw/openclaw.json`, JSON5   | Plaintext, or SecretRefs to env, file, exec or a store | `openclaw update` per channel             |
| Hermes Agent   | 0.21.5          | Script, Docker                       | `~/.hermes/config.yaml`              | `~/.hermes/.env`, mode 0600                            | `hermes update`, or pull a new image      |
| Home Assistant | 2026.2          | HA OS or Container                   | UI storage plus `configuration.yaml` | `secrets.yaml` through `!secret`                       | Supervisor on HA OS; by hand in Container |
| n8n            | 2.42.4          | Docker Compose                       | `.env`                               | Encryption key in the data volume                      | Pull a new image                          |
| Immich         | v2 and v3 lines | Compose file from each release       | `.env` with `IMMICH_VERSION`         | `.env`                                                 | Change the pin, pull                      |

### OpenClaw

OpenClaw installs by script, a global npm, pnpm or Bun package, Docker, Podman, Kubernetes, Nix or
Ansible, and needs Node 24.16 or later ([install](https://docs.openclaw.ai/install)). Its config in
`~/.openclaw/openclaw.json` follows a strict schema, and the Gateway refuses to start on an unknown
key, a malformed type or an invalid value
([configuration](https://docs.openclaw.ai/gateway/configuration)). The
[2.1 notes](../2.1-notes/openclaw.md) cover its runtime and security record.

Secrets are opt-in SecretRefs with 4 providers: `env`, `file`, `exec` for 1Password, Bitwarden,
Vault, pass or sops, and `store`, a shared SQLite store. "Plaintext still works"
([secrets](https://docs.openclaw.ai/gateway/secrets)). The `exec` provider lets one config name a
secret without fixing where the secret lives.

`openclaw update` detects the install type and follows one of 4 channels: stable, beta,
extended-stable and dev ([updating](https://docs.openclaw.ai/install/updating)). The Docker
entrypoint runs `openclaw doctor --fix` for migrations and writes
`<db>.pre-startup-migration-<id>.bak` before a schema change
([Docker](https://docs.openclaw.ai/install/docker)). The Nix flake pins every input, rolls back with
`home-manager switch --rollback`, and with `OPENCLAW_NIX_MODE=1` treats `openclaw.json` as immutable
and turns self-update off ([Nix](https://docs.openclaw.ai/install/nix)).

OpenClaw recommends keeping the agent workspace, with `AGENTS.md`, `SOUL.md` and `memory/`, in a
private git repo, and keeping `~/.openclaw/` with its config, credentials and database out of it
([agent workspace](https://docs.openclaw.ai/concepts/agent-workspace)). The Gateway binds to
loopback on port 18789, and remote access goes through Tailscale Serve, an SSH tunnel or a tailnet
address. Funnel "refuses startup unless auth mode is password"
([Tailscale](https://docs.openclaw.ai/gateway/tailscale);
[remote](https://docs.openclaw.ai/gateway/remote)).

### Hermes Agent

Hermes 0.21.5 installs by script and keeps `config.yaml`, `.env`, `SOUL.md`, memories, skills and
sessions in `~/.hermes/`
([configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)). The docs put
API keys, bot tokens and passwords in `.env` and everything else in `config.yaml`, and YAML values
can reference `${VAR}`. The Docker image mounts `~/.hermes` at `/opt/data`, and the docs recommend a
version tag or a digest in production, because "The image itself is stateless"
([Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)). Its dashboard fails closed
on a non-loopback address unless basic auth, Nous Portal OAuth or a self-hosted OpenID Connect
(OIDC) provider is set. With no allowlist for a platform, "all users are denied"
([security](https://hermes-agent.nousresearch.com/docs/user-guide/security)). The
[2.1 notes](../2.1-notes/hermes.md) cover the rest.

### Home Assistant

Home Assistant offers 2 install types: HA OS, which it recommends, and Container, where the owner
must "manually handle updates" and gets no apps
([installation](https://www.home-assistant.io/installation/)). Core and Supervised lost support with
release 2025.12
([deprecation](https://home-assistant.io/blog/2025/05/22/deprecating-core-and-supervised-installation-methods-and-32-bit-systems/)).
Add-ons became "apps" in 2026.2
([release 2026.2](https://www.home-assistant.io/blog/2026/02/04/release-20262/)).

Configuration splits between the UI and `configuration.yaml`
([configuration](https://www.home-assistant.io/docs/configuration/)). `!secret name` resolves from
`secrets.yaml` in the same folder or a parent
([secrets](https://www.home-assistant.io/docs/configuration/secrets/)), and packages bundle several
integrations per file ([packages](https://www.home-assistant.io/docs/configuration/packages/)). The
community guide to keeping the config in git ignores everything by default and lists files to
include, keeping `secrets.yaml` and `.storage` out because `.storage` holds credentials
([community guide](https://community.home-assistant.io/t/sharing-your-configuration-on-github/195144)).
The split between UI state and YAML is the main cost of that guide: the repo never holds the whole
configuration.

Since 2025.1, Home Assistant takes nightly backups, "encrypted with AES-128 by default", and gives
the owner an emergency kit that holds the key
([release 2025.1](https://www.home-assistant.io/blog/2025/01/03/release-20251/)). For remote access,
it recommends Home Assistant Cloud for most people, and lists a VPN such as Tailscale, a reverse
proxy, or a forwarded port, which it warns is not secure
([remote access](https://www.home-assistant.io/docs/configuration/remote/)).

## Layout of a deployment repo

No comparable project defines a deployment repo that holds both the system's version and the owner's
behaviour. The pieces exist apart: OpenClaw's workspace in git, its immutable Nix mode, Home
Assistant's packages, Komodo's resource sync from TOML in git
([Komodo](https://komo.do/docs/sync-resources)), and Kamal's `config/deploy.yml` in an app repo
([Kamal](https://kamal-deploy.org/)). A layout that combines them could look like this:

```text
nixie.toml          pinned nixie version, hosts, enabled connectors and channels
persona/            persona files
jobs/               one file per job
policy/             rules, effect overrides, risk stance per context
mcp/                pinned third-party MCP servers and their declared effects
secrets/            sops-encrypted files, or references such as op://vault/item/field
compose.yaml        or a Nix flake, which runs the pinned version
```

The repo's commit gives Tier 2's "version stored in every record" a value: each record can carry the
commit that defined the persona, job and rule behind it. The cost falls on track 2.4. A private repo
on a git host puts the owner's rules, persona and job definitions on a third party, and the brief
already asks where personal data lives given that "a git host is a third party". Memory and the
event log stay out of the repo, as OpenClaw keeps its database out of its workspace repo.

## Secrets

A deployment repo can hold encrypted secrets, or references that resolve on the host from a secrets
manager.

| Tool                       | Version or price                                      | Where the plaintext lives               | Who else holds it                       | Self-hosted     |
| -------------------------- | ----------------------------------------------------- | --------------------------------------- | --------------------------------------- | --------------- |
| sops with age              | sops 3.13.3, age 1.3.2                                | Ciphertext in the repo, key on the host | The git host holds ciphertext only      | Yes             |
| 1Password service accounts | Free, with rate limits per plan                       | 1Password vault                         | 1Password                               | No              |
| 1Password Connect          | Price not shown                                       | Cached on the owner's Connect server    | 1Password                               | Partly          |
| Doppler                    | Developer free for 3 users, Team $21 per user a month | Doppler                                 | Doppler                                 | Enterprise only |
| Infisical                  | MIT outside `ee`                                      | The owner's Infisical server            | Nobody                                  | Yes             |
| Bitwarden Secrets Manager  | Free for 3 machine accounts                           | Bitwarden                               | Bitwarden, unless Enterprise self-hosts | Enterprise      |
| systemd credentials        | Part of systemd                                       | Encrypted with a TPM2 or host key       | Nobody                                  | Yes             |

Sources: [sops](https://github.com/getsops/sops/releases),
[age](https://github.com/FiloSottile/age/releases),
[1Password service accounts](https://www.1password.dev/service-accounts/) and
[rate limits](https://www.1password.dev/service-accounts/rate-limits/),
[1Password Connect](https://www.1password.dev/connect/),
[Doppler pricing](https://www.doppler.com/pricing),
[Infisical](https://github.com/Infisical/infisical),
[Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/),
[systemd credentials](https://systemd.io/CREDENTIALS/).

sops encrypts values in YAML, JSON, env and INI files, keeps its rules in `.sops.yaml`, and supports
age, PGP, Vault and cloud key services. age 1.3.0 added post-quantum hybrid recipients and tag
recipients for YubiKey and TPM plugins. With sops and age, the repo carries its own secrets and the
host needs only the age key, so nothing outside the owner's hosts sees a plaintext secret.

1Password service accounts are free but rate-limited. An individual or Families plan allows 1,000
reads per hour per token and 1,000 a day per account; Business allows 10,000 per hour and 50,000 a
day. A deployment that resolves secrets at start-up stays well inside those limits, and one that
reads a secret per tool call does not. `op run --env-file` exposes secrets as environment variables
"only for the duration of the process"
([op run](https://www.1password.dev/cli/secrets-environment-variables/)), and `op inject` renders a
template with `op://` references into a file
([op inject](https://www.1password.dev/cli/secrets-config-files/)).

Docker Compose mounts each granted secret at `/run/secrets/<name>`, and official images read
`*_FILE` variables ([Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)).
systemd's `LoadCredentialEncrypted=` gives a service a file under `$CREDENTIALS_DIRECTORY` that only
the local hardware and OS installation can decrypt.

OAuth refresh tokens differ from the secrets above: a running deployment writes them when the owner
connects an account, and refreshes them itself. They belong in nixie's own credential store on the
host, encrypted at rest, and not in the deployment repo. The
[MCP notes](./mcp.md#triggers-channels-and-brokering) cover that store.

## Upgrades from the repo

A pinned version in the repo turns an upgrade into a pull request. Renovate's docker-compose manager
bumps image tags, and its regex manager bumps a version anywhere a comment marks it, such as
`# renovate: datasource=npm depName=<package>`
([regex manager](https://docs.renovatebot.com/modules/manager/regex/);
[docker-compose manager](https://docs.renovatebot.com/modules/manager/docker-compose/)). Dependabot
has supported Docker Compose since February 2025
([GitHub changelog](https://github.blog/changelog/2025-02-25-dependabot-version-updates-now-support-docker-compose-in-general-availability/)).
A merge then has to reach the host: Komodo and Dokploy redeploy on a push webhook, Kamal deploys
over SSH, and NixOS rebuilds from a flake with `nixos-rebuild switch --flake`
([Dokploy](https://docs.dokploy.com/en/docs/core/docker-compose/auto-deploy);
[NixOS flakes](https://wiki.nixos.org/wiki/Flakes)).

Watchtower, which pulled new images without a commit, was archived on 17 December 2025 and is "no
longer maintained" ([Watchtower](https://github.com/containrrr/watchtower)). An unattended pull also
leaves the repo's pin behind the running version, which breaks the commit as a record of what ran.

Database migrations make rollback the hard case. Reverting the pin restores old code but not the old
schema. OpenClaw's pattern, a backup of the database before each migration, gives a rollback that
restores data too, at the cost of losing whatever happened after the upgrade. Requirement tier 2
asks for "safe upgrades with rollback", so a migration that cannot run backwards needs that backup.

## Containers or a single binary

Bun 1.4.2 compiles a program into one executable with `bun build --compile`, for Linux, Windows and
macOS on x64 and arm64, with musl variants
([Bun executables](https://bun.com/docs/bundler/executables);
[Bun releases](https://github.com/oven-sh/bun/releases)). A single binary removes the container
runtime from the host, but a nixie host would keep one anyway: imps run code in microVMs on the
host, and the [placement decision](../../decisions/0003-sdk-placement.md) runs coding sessions
inside them. The choice between Postgres and SQLite, which
[decision 0001](../../decisions/0001-durable-layer.md) leaves open, decides more: SQLite lives in a
file next to a binary, while Postgres adds a second service that a Compose file starts beside nixie.

| Shape                  | Fits               | Upgrade                   | Cost                                   |
| ---------------------- | ------------------ | ------------------------- | -------------------------------------- |
| OCI image with Compose | Postgres or SQLite | Bump the tag, pull        | A container runtime on the host        |
| Single Bun binary      | SQLite             | Replace the file, restart | A service unit and an updater to write |
| Nix flake              | Either             | Bump the lock, rebuild    | The owner runs Nix                     |

Official `oven/bun` images come in debian, slim, alpine and distroless variants
([oven/bun](https://hub.docker.com/r/oven/bun)).

## Reverse proxies and tunnels

Which route a deployment needs depends on 2 kinds of traffic: the owner's own devices reaching the
dashboard and approval pages, and outside services pushing webhooks to nixie.

| Route                      | TLS ends at       | Reach                               | Owner identity                | Price                             |
| -------------------------- | ----------------- | ----------------------------------- | ----------------------------- | --------------------------------- |
| Tailscale Serve            | The owner's host  | The tailnet only                    | `Tailscale-User-Login` header | Personal plan free                |
| Tailscale Funnel           | The owner's host  | Public, on ports 443, 8443, 10000   | None                          | All plans                         |
| Cloudflare Tunnel          | Cloudflare's edge | Public, with optional Access policy | Access, if configured         | Not confirmed on an official page |
| Caddy or Traefik on a port | The owner's host  | Public, ports 80 and 443 open       | Whatever nixie checks         | Free                              |

Sources: [Tailscale Serve](https://tailscale.com/kb/1312/serve),
[Tailscale Funnel](https://tailscale.com/kb/1223/funnel),
[Tailscale pricing](https://tailscale.com/pricing),
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/),
[Cloudflare SSL modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/),
[Caddy](https://caddyserver.com/docs/automatic-https),
[Traefik](https://doc.traefik.io/traefik/reference/install-configuration/providers/docker/).

Funnel relays "do not decrypt", so the owner's host terminates TLS. Cloudflare Tunnel makes
"outbound-only connections" but runs 2 TLS connections, one from the visitor to Cloudflare and one
from Cloudflare to the origin, so Cloudflare sees every request in plaintext. For webhooks that
carry email notifications or calendar changes, that puts the content on a third party, against
"Owner data stays home".

The chat channels decide whether any public route is needed. Telegram's `getUpdates` long polling
keeps updates for 24 hours and needs no listener ([Bot API](https://core.telegram.org/bots/api)).
Slack Socket Mode works "without exposing a public HTTP Request URL"
([Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)), and the Discord Gateway
is a WebSocket that the bot opens ([Gateway](https://docs.discord.com/developers/events/gateway)).
Push from connectors is the other source of webhooks: Gmail's push goes through Google Cloud
Pub/Sub, which offers a pull subscription, and Microsoft Graph change notifications need a public
HTTPS endpoint. The [connector notes](./connectors.md) cover each.

tsidp is an OIDC provider backed by tailnet identity, which lists MCP authorization as a use case,
but it describes itself as "experimental" ([tsidp](https://github.com/tailscale/tsidp)).

## Worth borrowing

- OpenClaw's SecretRef providers, especially `exec`, so one config can name a secret held anywhere
- OpenClaw's strict config schema that refuses to start on an unknown key
- OpenClaw's database backup before each migration
- OpenClaw's Nix mode, where the config is immutable and self-update is off
- Hermes' dashboard that fails closed off loopback, and its deny-all default for an unlisted
  platform user
- Home Assistant's encrypted nightly backups with an emergency kit for the key
- Renovate or Dependabot pull requests as the upgrade path
- the Compose `*_FILE` convention and systemd encrypted credentials

## Worth avoiding

- Watchtower or any unattended pull that leaves the repo's pin behind the running version
- Home Assistant's split between UI state and YAML, which keeps the repo from holding the whole
  configuration
- plaintext secrets in a `.env` beside the config, the default in OpenClaw, Hermes and n8n
- Cloudflare Tunnel for webhooks that carry personal data
- a self-update command as the only upgrade path, which bypasses the repo

## Recommendations

- **A deployment repo that pins nixie's version, holds persona, jobs and policy, and references
  secrets.** Its commit becomes the definition version in every record. The cost is that the owner's
  rules sit on a git host, which track 2.4 has to weigh.
- **An OCI image with a Compose file as the first shape, with a single binary as a candidate if
  SQLite wins.** The image fits either database and matches Home Assistant, n8n and Immich. The cost
  is a container runtime, which the host runs for imp in any case.
- **sops with age as the default for secrets, and an `exec` resolver for 1Password and others.**
  sops keeps every secret on the owner's hosts and in the repo's history. The cost is key handling:
  losing the age key loses the secrets. A leaked key also decrypts every earlier commit, so recovery
  means rotating or revoking every secret the repo ever held, not only re-encrypting the current
  files.
- **Upgrades through a dependency bot's pull request, with a database backup before every
  migration.** An upgrade is a merge, and a rollback is a revert plus a restore. The cost is that a
  rollback loses data written after the upgrade.
- **Bind to loopback and reach the dashboard through Tailscale Serve, with no public route unless a
  channel or connector needs webhooks.** Funnel suits webhooks, because TLS ends on the owner's
  host. The cost is a Tailscale account, and Funnel has bandwidth limits that the owner cannot
  change.

## Proposed spikes

- **A deployment repo on a throwaway host.** Build a repo with a Compose file that pins an image,
  sops-encrypted secrets with an age key on the host, and a Renovate config, then merge a version
  bump and roll it back with a database restore. It tests whether an upgrade is a merge and a
  rollback is a revert plus a restore. About half a day.
- **A deployment with no inbound route.** Run a Telegram bot on long polling and a dashboard behind
  Tailscale Serve on a host with no open port, and confirm the owner's identity header reaches the
  dashboard. About 2 hours.

## Open questions

- Where does the deployment repo live, given that a git host is a third party? Track 2.4 owns the
  question.
- Which part of the persona, jobs and policy can the owner edit at runtime, and how does an edit
  flow back into the repo? A rule from "always allow" under
  [decision 0006](../../decisions/0006-approval-record.md) is written at runtime.
- How does a merged upgrade reach the host: a webhook, a poll from the host, or the owner running
  one command? A poll needs no inbound route.
- Does the free Cloudflare plan cover Tunnel and Access for one owner? The notes found only
  secondary sources.
- Does nixie need a Postgres image beside its own, which depends on the open choice in decision
  0001?
