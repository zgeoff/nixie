<div align="center">
  <h1>nixie documentation</h1>

  <p>What nixie is, what binds it, what has been decided, and what is still open.</p>

  <p>
    <a href="./overview.md">Overview</a> •
    <a href="./principles.md">Principles</a> •
    <a href="./scope.md">Scope</a> •
    <a href="./design/open-items.md">Open items</a> •
    <a href="#design">Design</a> •
    <a href="#decisions">Decisions</a> •
    <a href="#research">Research</a> •
    <a href="#brainstorm">Brainstorm</a> •
    <a href="../spikes/README.md">Spikes</a> •
    <a href="../AGENTS.md">Agent Guidelines</a>
  </p>
</div>

## Start here

- [Overview](./overview.md) — what nixie is, why it exists, and the current design in brief
- [Principles](./principles.md) — the rules every job and deployment holds to
- [Scope](./scope.md) — requirements and non-goals
- [Glossary](./glossary.md) — the tentative terms the docs use
- [Open items](./design/open-items.md) — deferred decisions, spikes to run, design tasks and later
  stages

`design/` holds designs for what is not built yet, and `architecture/` will hold what is built. Both
use the same topics as the decisions below.

## Design

Designs for what is not built yet, grouped by the same topics as the decisions. Each design links
the decisions it rests on.

### Core

- [The event log and records](./design/core/event-log.md) — what a record holds, append-only
  semantics, the projections behind the live view and the task board, export and retention
- [Tasks](./design/core/tasks.md) — tasks as state machines with leases and an inbox, waits, routing
  from the conversation, job runs, workers in imps, and crash recovery
- [Outside actions](./design/core/outside-actions.md) — the outside action queue, its outcomes,
  approval consumption, reconciliation per connector, and unknown outcomes for the owner

### Policy

- [Policy design index](./design/policy/README.md) — the 4 policy docs and the spike behind them
- [The policy decision point](./design/policy/decision-point.md) — the pipeline, effects, the
  always-ask set, destination limits and consent, taint in the first build, auto-mode, prompt causes
  and the scripted scenarios, with the policy decisions for the owner
- [Rules](./design/policy/rules.md) — the rule format, evaluation order, rule identity, the snapshot
  hash, the widening check, proposed rules, grants with expiries and the starter rule set
- [Proposals and approvals](./design/policy/approvals.md) — the proposal and its action hash, risk
  classes, the approval record, "always allow" and the digest sheet
- [Budgets, lifts and the spending stop](./design/policy/budgets.md) — budgets, lifting rules,
  limits on model cost and the hard spending stop

## Decisions

What nixie has settled, each with its reasons and the alternatives, grouped by topic. The numbers
are stable IDs in the order the decisions were made; a later record can amend an earlier one.

### Core

The runtime, the durable layer, and how the main thread and tasks share work.

- [0001: The durable layer](./decisions/0001-durable-layer.md) — nixie's own event log, with each
  long task as a state machine, instead of a durable execution engine
- [0003: Where the Agent SDK runs](./decisions/0003-sdk-placement.md) — on the host with only
  nixie's tools for assistant work, and inside an imp for coding work
- [0018: The main thread and tasks](./decisions/0018-main-thread-and-tasks.md) — the owner works
  through the main thread, which routes work to tasks and shares a live view
- [0021: Outside action outcomes](./decisions/0021-outside-action-outcomes.md) — outside actions run
  on a durable queue, and an unknown outcome is retried only with an idempotency key or a check
- [0025: The database and the topology](./decisions/0025-database-and-topology.md) — one SQLite
  database with nixie's own dialect, and a modular monolith of workspace packages
- [0026: Where workers and the conversation run](./decisions/0026-where-workers-and-the-conversation-run.md)
  — an imp per worker with the whole worker inside, the conversation in a long-lived imp, and the
  model credential as the one grant
- [0027: Tasks and outside actions](./decisions/0027-tasks-and-outside-actions.md) — state tables
  beside the log, the conversation as a task, pause, stop and close, catch-up runs, and unknown
  outcomes in the digest

### Policy

Rules, effects, taint, approvals and auto-mode.

- [0002: Outside actions and approvals](./decisions/0002-approvals.md) — every outside action runs
  through nixie's tools, and an action that needs approval becomes a proposal that ends the turn
- [0004: The rule engine](./decisions/0004-rule-engine.md) — nixie's own rule format with fixed
  checks, and "no rule matched" means ask
- [0005: Effects, taint and prompts](./decisions/0005-effects-and-taint.md) — declared tool effects,
  the always-ask set, the tool as the boundary, and the 0-prompt target
- [0006: The approval record](./decisions/0006-approval-record.md) — approvals bound to one action
  and used once, "always allow" as a rule, and digest approvals
- [0008: auto-mode decides the grey zone](./decisions/0008-auto-mode.md) — auto-mode decides what
  the deterministic layers leave open, and nixie runs fully without it
- [0012: High-risk approvals](./decisions/0012-high-risk-approvals.md) — a passkey check for the
  always-ask set, and a tap for everything else
- [0015: Where taint applies](./decisions/0015-taint-scope.md) — the conversation is always
  untrusted, and taint applies to jobs and workers in stages
- [0023: Lifting the always-ask set](./decisions/0023-lifting-always-ask.md) — a bounded rule can
  lift it, creating one always asks, and such approvals look distinct

### Memory

The memory store, which writes skip review, and definition versioning.

- [0010: The memory store](./decisions/0010-memory-store.md) — memory as rows in nixie's database, a
  UI and a raw recall tool, and forgetting by crypto-shredding
- [0011: Which memory writes skip review](./decisions/0011-memory-writes.md) — a write backed by the
  owner's own quote applies at once with undo, and every other write is a proposal
- [0013: Definition versioning](./decisions/0013-definition-versioning.md) — a snapshot hash on
  every record, with rules applying at once and persona and jobs fixed per task
- [0024: How memory reaches the model](./decisions/0024-memory-in-context.md) — the SDK's session
  and compaction, with retrieval over memory and the event log, keyword search first

### Channels

Clients, push and voice.

- [0009: The first channel](./decisions/0009-first-channel.md) — nixie's own client holds the
  conversation, approvals and voice, and chat apps carry content-free pushes

### Connectors

Nixie's interfaces, outside MCP servers, credentials and search.

- [0007: Credential grants](./decisions/0007-grants-and-taint.md) — no grant for an imp that reads
  untrusted content
- [0014: Search](./decisions/0014-search.md) — Kagi, with full results in the conversation
- [0016: nixie's own interfaces](./decisions/0016-own-interfaces.md) — channel adapter, trigger
  source, connector, credential store, definitions source and sandbox adapter, with tools from MCP
- [0017: Outside MCP servers](./decisions/0017-mcp-proxy.md) — every MCP server outside nixie's code
  goes through a proxy, the owner's own included
- [0019: Connector authorization](./decisions/0019-connector-authorization.md) — each owner
  registers their own OAuth clients, and the Google spike runs early
- [0022: Coding and code execution](./decisions/0022-coding-and-code-execution.md) — running code in
  a sandbox with no grants, and coding sessions through adapters, atc first

### Deployment

Definitions and deployment models.

- [0020: Deployment and definitions](./decisions/0020-deployment.md) — definitions in their own repo
  seed the database, and running nixie lives with the deployment

## Research

Phase 2, kept for its evidence until it is archived. Where a decision exists, it supersedes the
research recommendation. Each track has a landscape doc with its findings and recommendations, and
notes with the evidence and sources.

### 2.1 Landscape and architecture models

- [Landscape](./research/2.1-landscape.md) — hosted assistants, open-source agents, frameworks, and
  the published architecture models, and why none fits nixie as a whole
- Notes:
  - [Anthropic](./research/2.1-notes/anthropic.md) — the Agent SDK, Managed Agents, and Anthropic's
    consumer agents
  - [Architecture writing](./research/2.1-notes/architecture-writing.md) — 5 published architecture
    models for always-on agents
  - [OpenAI Dots](./research/2.1-notes/dots.md) — a coordinator agent on its own cloud computer
  - [eve](./research/2.1-notes/eve.md) — a durable agent framework on Nitro
  - [Grok Bot and Gemini Spark](./research/2.1-notes/grok-bot-and-spark.md) — cloud-hosted personal
    agents from xAI and Google
  - [Hermes Agent](./research/2.1-notes/hermes.md) — a self-hosted agent with a learning loop
  - [Letta](./research/2.1-notes/letta.md) — Letta Code and memory kept as a git repository of
    markdown
  - [Mastra and the Claude Agent SDK](./research/2.1-notes/mastra-and-agent-sdk.md) — a TypeScript
    framework, and the SDK's loop and permission pipeline
  - [NanoClaw, IronClaw, and ZeroClaw](./research/2.1-notes/nanoclaw-ironclaw-zeroclaw.md) — three
    security-focused agents and their defaults
  - [OpenClaw](./research/2.1-notes/openclaw.md) — the largest open-source assistant and its
    security record

### 2.2 and 2.3 Core, runtime and policy

- [Landscape](./research/2.2-2.3-core-and-policy.md) — the SDK turn, the policy mod, approvals,
  owner messages, durable execution, policy layers, and imp's credential broker
- Notes:
  - [Durable execution engines](./research/2.2-notes/engines.md) — 11 engines compared, and the
    Agent SDK inside one
  - [Policy models](./research/2.3-notes/policy-models.md) — rule languages, typed effects,
    capability systems, and information-flow control
  - [Approvals and owner friction](./research/2.3-notes/approvals.md) — how products and standards
    store, bind and replay approvals, and how they cut prompts

### 2.4 to 2.6 Data, channels and connectors

- [Landscape](./research/2.4-2.6-data-channels-connectors.md) — memory, where data lives, chat
  channels, voice, MCP, connector authorization, and deployment, with the tensions between them
- Memory and data notes:
  - [Memory models](./research/2.4-notes/memory-models.md) — files in git, structured stores, graphs
    and vector retrieval, and memory poisoning
  - [Where personal data lives](./research/2.4-notes/data-and-storage.md) — the owner's host,
    encrypted backups, export, and Postgres or SQLite for the event log
  - [Versioning persona, jobs and policy](./research/2.4-notes/definition-versioning.md) — a
    snapshot hash on every record, for replay
- Channels and voice notes:
  - [Chat channels](./research/2.5-notes/channels.md) — owner identity, approval buttons and privacy
    across Telegram, Matrix, WhatsApp, Signal, iMessage and others
  - [Realtime voice stacks](./research/2.5-notes/voice.md) — pipelines, speech-to-speech APIs and
    local options, and who holds the conversation
  - [Voice transports](./research/2.5-notes/transports.md) — web clients, voice notes, native apps
    and phone lines
- Connectors and deployment notes:
  - [MCP and nixie's own interfaces](./research/2.6-notes/mcp.md) — the current MCP spec, a proxy
    for third-party servers, and taint by output field
  - [Connector authorization and search providers](./research/2.6-notes/connectors.md) — Google,
    Microsoft, Apple and IMAP setup, and model-agnostic search
  - [Deployment repo and infrastructure](./research/2.6-notes/deployment.md) — the private repo,
    images, secrets, upgrades and network access

## Brainstorm

Phase 1, kept until it is archived. The principles and scope above replace it.

- [Why nixie](./brainstorm/1.1-why.md) — the problem, and what full control means
- [Jobs](./brainstorm/1.2-jobs.md) — the kinds of job a deployment defines
- [Principles](./brainstorm/1.3-principles.md) — the rules every job and deployment holds to, each
  with a test
- [Requirements](./brainstorm/1.4-requirements.md) — requirements in tiers, each traced to a job or
  a principle
- [Non-goals](./brainstorm/1.5-non-goals.md) — what nixie deliberately is not
- [Research brief](./brainstorm/1.6-research-brief.md) — the questions each research track settles

## Spikes

Throwaway experiments that answer research questions, each runnable, with its output and what it
left untested. The [spikes index](../spikes/README.md) describes how they run.

- [A policy mod in the Agent SDK](../spikes/sdk-mod-policy/) — what a mod can enforce, and the 3
  ways it fails open
- [Hold a tool call for an owner decision](../spikes/sdk-long-hold/) — hook time limits, long holds,
  and `defer` across processes
- [Owner messages into a running task](../spikes/sdk-owner-input/) — when each message priority
  reaches the model
- [imp credential broker grants](../spikes/imp-broker/) — what a grant can and cannot limit
- [Where `query()` runs](../spikes/sdk-placement/) — the SDK on the host with only nixie's tools,
  and inside an imp
- [Model choice for chat, memory and tools](../spikes/model-eval/) — persona, invented memory, tool
  honesty, cost and latency per model
- [A personal Google OAuth client](../spikes/google-oauth/) — an unverified client in production,
  Gmail's restricted scope, and token refresh past 7 days
- [Worker start inside an imp](../spikes/imp-worker-start/) — imp create and wake, and the SDK's
  first token inside an imp against the host
- [Resume a session at a given message](../spikes/sdk-resume-at/) — `resumeSessionAt` and
  `forkSession` drop a turn that never committed
- [The rule engine and prompt scenarios](../spikes/policy-rules/) — one decision per call whatever
  the rule order, a stable snapshot hash, a conservative widening check, and prompts by cause
