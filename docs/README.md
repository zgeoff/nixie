<div align="center">
  <h1>nixie documentation</h1>

  <p>What nixie is, what binds it, what has been decided, and what is still open.</p>

  <p>
    <a href="./overview.md">Overview</a> •
    <a href="./principles.md">Principles</a> •
    <a href="./scope.md">Scope</a> •
    <a href="https://linear.app/zgeoff/project/nixie-caa59289fb88">Planned work</a> •
    <a href="#design">Design</a> •
    <a href="#decisions">Decisions</a> •
    <a href="#archive">Archive</a> •
    <a href="#spikes">Spikes</a> •
    <a href="../AGENTS.md">Agent Guidelines</a>
  </p>
</div>

## Start here

- [Overview](overview.md) — what nixie is, why it exists, and the design in brief
- [Principles](principles.md) — the rules every job and deployment holds to
- [Scope](scope.md) — requirements in tiers, and non-goals
- [Glossary](glossary.md) — the terms the docs and the code use, one meaning each
- [Planned work](https://linear.app/zgeoff/project/nixie-caa59289fb88) — the nixie project in
  Linear: the slice plan, choices that need you, spikes, design tasks and later stages

`decisions/` holds the decision records, which stay. `design/<work>/` holds the design for a piece
of work that is not built yet, with its spikes in `design/<work>/spikes/`: `design/platform/` is the
first. `architecture/` will hold what is built. Designs and architecture use the topics of the
decisions below, and planned work lives in Linear.

## Design

Each design states its contracts, marks what the first build implements, and links the decisions it
rests on.

- [Slice plan](https://linear.app/zgeoff/document/slice-plan-f056442e64a3) — the first build in 9
  ordered slices, each with its scope, what it needs first and its acceptance checks, in Linear
- [Code layout](design/platform/code-layout.md) — the workspace folders, package boundaries, the
  module packages, the images and the checks

### Core

- [Core design index](design/platform/core/README.md) — the 4 core docs
- [The event log and records](design/platform/core/event-log.md) — what a record holds, append-only
  semantics, projections, the data behind the dashboard and the live view, export and retention
- [Tasks](design/platform/core/tasks.md) — tasks as state machines with leases and an inbox, waits,
  routing from the conversation, job runs, workers in imps, and crash recovery
- [Actions](design/platform/core/actions.md) — the action queue, its outcomes, approval consumption,
  reconciliation per connector, and unknown outcomes
- [Model profiles](design/platform/core/models.md) — the profile, model roles and their defaults,
  and how nixie computes model cost

### Policy

- [Policy design index](design/platform/policy/README.md) — the 4 policy docs and the spike behind
  them
- [The policy decision point](design/platform/policy/decision-point.md) — the pipeline, effects, the
  always-ask set, destination limits and consent, taint in the first build, auto-mode and prompt
  causes
- [Rules](design/platform/policy/rules.md) — the rule format, evaluation order, rule identity, the
  snapshot hash, the widening check, proposed rules, mandates and the starter rule set
- [Proposals and approvals](design/platform/policy/approvals.md) — the proposal and its action hash,
  risk classes, the approval record, one-tap "always allow" and the approval digest
- [Budgets, lifts and the spending stop](design/platform/policy/budgets.md) — budgets, lifting
  rules, model cost and the hard spending stop

### Memory

- [The memory store](design/platform/memory/store.md) — the first build, items and versions, a key
  per item, retire and forget, bulk deletion, recall, the memory view and export
- [Memory writes](design/platform/memory/writes.md) — who writes memory, batched capture, the quote,
  token and checker checks, memory proposals, notices and undo, and consolidation
- [Memory in context](design/platform/memory/context.md) — the prompt, the pinned core, retrieval
  over memory and past messages, compaction, and the SDK transcript as a cache

### Channels

- [Channels design index](design/platform/channels/README.md) — the client, the channel adapter,
  approvals, the live view and the trigger source
- [The client](design/platform/channels/client.md) — the web client and the Expo app, the typed API,
  device sessions, paste spans and messages into a running task
- [The channel adapter](design/platform/channels/channel-adapter.md) — the interface, the identity
  record, and the Telegram notifier with its content-free notice
- [Approvals in the client](design/platform/channels/approvals.md) — cards, your choices with Defer,
  the server's check, and the approval digest
- [The dashboard and the live view](design/platform/channels/live-view.md) — the dashboard, a task
  as a conversation, stepping in and routing marks
- [The trigger source](design/platform/channels/trigger-source.md) — schedules, polls, webhooks and
  streams

### Connectors

- [Connectors design index](design/platform/connectors/README.md) — the connector interface and
  Google, tools and the MCP endpoint, the external-server proxy, the coding adapter, the sandbox
  adapter, credentials and the definitions source

### Deployment

- [Deployment design index](design/platform/deployment/README.md) — the 5 deployment docs
- [Deployment](design/platform/deployment/deployment.md) — the first build, the host, the images,
  secrets, seeding the definitions, health, and Kubernetes
- [Deployment configuration](design/platform/deployment/configuration.md) — the YAML file, what it
  holds, its schema, and how it is mounted
- [Backup and restore](design/platform/deployment/backup-and-restore.md) — the backup sidecar,
  Restic snapshots, the key repo and forget, the offsite replica, and restoring on a new host
- [Release pipeline](design/platform/deployment/release-pipeline.md) — versioning, the build order,
  registry publishing, attestations, pinned binaries and the compatibility checks
- [Upgrades](design/platform/deployment/upgrades.md) — the pin and the bot, delivery to the host, a
  release on the host, migrations, and rollback

## Decisions

The locked design baseline: each record states its decision as it stands, with its reasons and the
alternatives it rejected. The numbers are stable IDs in the order the decisions were made.

### Core

The runtime, the durable layer, and how the conversation and tasks share work.

- [0001: The durable layer](decisions/0001-durable-layer.md) — nixie's own event log, with each long
  task as a state machine, instead of a durable execution engine
- [0003: Where the Agent SDK runs](decisions/0003-sdk-placement.md) — every model loop in an imp,
  with only nixie's tools, which run on the host
- [0018: The conversation and tasks](decisions/0018-the-conversation-and-tasks.md) — you work
  through the conversation, which routes work to tasks, and the conversation is itself a task
- [0021: Action outcomes](decisions/0021-action-outcomes.md) — actions run on a durable queue, and
  an unknown outcome is retried only with an idempotency key or a check
- [0025: The database and the topology](decisions/0025-database-and-topology.md) — one SQLite
  database with nixie's own dialect, and a modular monolith of workspace packages
- [0026: Where workers and the conversation run](decisions/0026-where-workers-and-the-conversation-run.md)
  — an imp per worker run with the whole worker inside, and the conversation in a long-lived imp
- [0027: Tasks and actions](decisions/0027-tasks-and-actions.md) — state tables beside the log,
  pause, stop and close, trigger details in every task run, and unknown outcomes in the approval
  digest
- [0033: Model profiles and model cost](decisions/0033-model-profiles.md) — a profile per model
  route, a profile per role, and model limits in dollars, tokens and turns
- [0034: The code layout](decisions/0034-code-layout.md) — 5 workspace folders by trust zone and
  role, the `@heynixie/` scope, and package boundaries checked by tag

### Policy

Rules, effects, taint, approvals and auto-mode.

- [0002: Actions and approvals](decisions/0002-approvals.md) — every action runs through nixie's
  tools, and an action that needs approval becomes a proposal that ends the turn
- [0004: The rule engine](decisions/0004-rule-engine.md) — nixie's own rule format with fixed
  checks, and "no rule matched" means ask
- [0005: Effects, taint and prompts](decisions/0005-effects-and-taint.md) — declared tool effects,
  the always-ask set, the tool as the boundary, and the 0-prompt target
- [0006: The approval record](decisions/0006-approval-record.md) — approvals bound to one action and
  used once, consent, one-tap "always allow", and the approval digest
- [0008: auto-mode decides the grey zone](decisions/0008-auto-mode.md) — auto-mode decides what the
  deterministic layers leave open, and nixie runs fully without it
- [0012: High-risk approvals](decisions/0012-high-risk-approvals.md) — a passkey check for the
  always-ask set, and a tap for everything else
- [0015: Where taint applies](decisions/0015-taint-scope.md) — the conversation is always untrusted,
  and taint applies to jobs and workers in stages
- [0023: Lifting the always-ask set](decisions/0023-lifting-always-ask.md) — a bounded rule can lift
  it, creating one always asks, and such approvals look distinct
- [0028: The policy design](decisions/0028-policy-design.md) — the consent checker, your ask rules
  as their own prompt cause, the spending stop as a host proxy, YAML rule files, and the permissive
  starter set with notices for jobs

### Memory

The memory store, its writes, how it reaches the model, and definition versioning.

- [0010: The memory store](decisions/0010-memory-store.md) — memory as rows in nixie's database, the
  memory view and a raw recall tool, and forgetting by crypto-shredding
- [0011: Which memory writes skip review](decisions/0011-memory-writes.md) — a write backed by a
  quote you typed applies at once with undo, and every other write is a proposal
- [0013: Definition versioning](decisions/0013-definition-versioning.md) — a snapshot hash on every
  record, with rules applying at once and persona and jobs fixed per task
- [0024: How memory reaches the model](decisions/0024-memory-in-context.md) — the SDK's session and
  compaction, with retrieval by local embeddings and keyword search
- [0031: Memory capture, context and removal](decisions/0031-memory-capture-context-and-removal.md)
  — batched capture, the transcript as a cache, reversible chat removal, grouped notices and the
  first build

### Channels

Clients, push and voice.

- [0009: The first channel](decisions/0009-first-channel.md) — nixie's own client holds the
  conversation, approvals and voice, and chat apps carry content-free pushes
- [0029: Channels and clients](decisions/0029-channels-and-clients.md) — oRPC, Start and Expo,
  device sessions, Defer, two push levels and native Android paste capture

### Connectors

nixie's interfaces, external MCP servers, credentials, search and code.

- [0007: Credential grants](decisions/0007-grants-and-taint.md) — no grant for an imp that reads
  untrusted content
- [0014: Search](decisions/0014-search.md) — Kagi, with full results in the conversation
- [0016: nixie's own interfaces](decisions/0016-own-interfaces.md) — channel adapter, trigger
  source, connector, credential store, definitions source and sandbox adapter, with tools from MCP
- [0017: External MCP servers](decisions/0017-mcp-proxy.md) — every MCP server outside nixie's code
  goes through a proxy that pins each tool
- [0019: Connector authorization](decisions/0019-connector-authorization.md) — each deployment
  registers its own OAuth clients
- [0022: Coding and code execution](decisions/0022-coding-and-code-execution.md) — running code in a
  sandbox with no grants, and coding sessions through adapters, atc first
- [0030: Connectors and sandbox environments](decisions/0030-connectors-and-sandbox-environments.md)
  — the reverse-forward route, Google first, web OAuth return, MCP v2, imp only, the code
  environment, and Disconnect

### Deployment

Definitions and deployment models.

- [0020: Deployment and definitions](decisions/0020-deployment.md) — definitions in their own repo
  seed the database, and running nixie lives with the deployment
- [0032: Offsite backups and replication](decisions/0032-offsite-backups-and-replication.md) —
  Restic snapshots first, then a Litestream replica through a host rclone crypt gateway to an
  S3-compatible backend the deployment supplies
- [0035: The backup sidecar](decisions/0035-backup-sidecar.md) — restic, Litestream and rclone in
  their own container beside nixie, with sops kept in nixie
- [0036: Deployment configuration and reference manifests](decisions/0036-deployment-configuration-and-reference-manifests.md)
  — one YAML file validated by a zod schema, and generic Kubernetes manifests shipped beside the
  Compose recipe

## Archive

The phase 1 brainstorm and the phase 2 research are archived at the
[`research-archive`](https://github.com/zgeoff/nixie/tree/research-archive/docs) tag. The decisions
supersede them, and links that cite them as evidence point at that tag.

## Spikes

Throwaway experiments that answer research questions, each runnable, with its output and what it
left untested. The [spikes index](design/platform/spikes/README.md) describes how they run.

- [A policy mod in the Agent SDK](design/platform/spikes/sdk-mod-policy/) — what a mod can enforce,
  and the 3 ways it fails open
- [Hold a tool call for a decision](design/platform/spikes/sdk-long-hold/) — hook time limits, long
  holds, and `defer` across processes
- [Messages into a running task](design/platform/spikes/sdk-owner-input/) — when each message
  priority reaches the model
- [imp credential broker grants](design/platform/spikes/imp-broker/) — what a grant can and cannot
  limit
- [Where `query()` runs](design/platform/spikes/sdk-placement/) — the SDK on the host with only
  nixie's tools, and inside an imp
- [Model choice for chat, memory and tools](design/platform/spikes/model-eval/) — persona, invented
  memory, tool honesty, cost and latency per model
- [A personal Google OAuth client](design/platform/spikes/google-oauth/) — an unverified client in
  production, Gmail's restricted scope, and token refresh past 7 days
- [Worker start inside an imp](design/platform/spikes/imp-worker-start/) — imp create and wake, and
  the SDK's first token inside an imp against the host
- [Serving nixie's tools](design/platform/spikes/tools-endpoint/) — the tool list, the MCP revision
  and the result the model receives, against a local stand-in for the model API
- [A pinning MCP proxy](design/platform/spikes/mcp-proxy-pin/) — hash pinning, effect declarations
  and output checks on the v2 MCP packages
- [A definitions source](design/platform/spikes/definitions-source/) — one content hash for the same
  definitions from a repo and a local path
- [Resume a session at a given message](design/platform/spikes/sdk-resume-at/) — `resumeSessionAt`
  and `forkSession` drop a turn that never committed
- [The rule engine and prompt scenarios](design/platform/spikes/policy-rules/) — one decision per
  call whatever the rule order, a stable snapshot hash, a conservative widening check, and prompts
  by cause
- [A typed API with a live stream](design/platform/spikes/client-rpc/) — one oRPC contract on Bun
  with checked actions and a stream that resumes by sequence
- [Paste spans in a text box](design/platform/spikes/paste-spans/) — which spans of a message you
  pasted, kept right through edits
- [Tools through a reverse forward](design/platform/spikes/tools-reverse-forward/) — relay overhead,
  streamed responses, egress isolation and reopening after wake
- [Retrieval on nixie-shaped memory](design/platform/spikes/memory-retrieval/) — keyword search,
  BM25 and local embeddings over synthetic memory, and where they part
- [Crypto-shredding memory items](design/platform/spikes/memory-shred/) — a key per item against
  backups, the key store's freed pages, and a persisted full-text index
- [The memory write checks](design/platform/spikes/memory-checks/) — the quote check and the token
  check as code over sample messages, and what still needs the checker
- [A pinned memory core](design/platform/spikes/sdk-pinned-core/) — when a changed system prompt
  reaches a resumed session, written and not yet run
- [Batched memory checkpoints](design/platform/spikes/memory-batch/) — source-bound quotes,
  process-kill recovery and a cursor-first failure control without model calls
- [Forget completion across backups](design/platform/spikes/forget-backups/) — snapshot removal,
  data pruning and restore with a deleted item key on a local candidate backend
- [Deploy, back up, restore and roll back](design/platform/spikes/deploy-local/) — a digest pin,
  sops secrets decrypted in the process, the key store in its own restic repo, and a rollback as a
  revert plus a restore
- [Replica encryption](design/platform/spikes/replica-encryption/) — Litestream through a host crypt
  gateway, process outages and a restore without the original database
- [Paired data and key recovery](design/platform/spikes/paired-recovery/) — continuous encrypted
  data plus Restic keys, stale-key control and a post-forget restore
