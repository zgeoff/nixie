<div align="center">
  <h1>nixie documentation</h1>

  <p>The record of deciding what nixie is: brainstorm, research, and the decisions they led to.</p>

  <p>
    <a href="#decisions">Decisions</a> •
    <a href="#research">Research</a> •
    <a href="#brainstorm">Brainstorm</a> •
    <a href="../spikes/README.md">Spikes</a> •
    <a href="../AGENTS.md">Agent Guidelines</a>
  </p>
</div>

## Decisions

What nixie has settled, each with its reasons, the alternatives, and the research behind it.

- [0001: The durable layer](./decisions/0001-durable-layer.md) — nixie's own event log, with each
  long task as a state machine, instead of a durable execution engine
- [0002: Outside actions and approvals](./decisions/0002-approvals.md) — every outside action runs
  through nixie's tools, and an action that needs approval becomes a proposal that ends the turn
- [0003: Where the Agent SDK runs](./decisions/0003-sdk-placement.md) — on the host with only
  nixie's tools for assistant work, and inside an imp for coding work
- [0004: The rule engine](./decisions/0004-rule-engine.md) — nixie's own rule format with fixed
  checks, and "no rule matched" means ask
- [0005: Effects, taint and prompts](./decisions/0005-effects-and-taint.md) — declared tool effects,
  the always-ask set, the tool as the boundary, and the 0-prompt target
- [0006: The approval record](./decisions/0006-approval-record.md) — approvals bound to one action
  and used once, "always allow" as a rule, and digest approvals
- [0007: Credential grants](./decisions/0007-grants-and-taint.md) — no grant for an imp that reads
  untrusted content
- [0008: auto-mode decides the grey zone](./decisions/0008-auto-mode.md) — auto-mode decides what
  the deterministic layers leave open, and nixie runs fully without it
- [0009: The first channel](./decisions/0009-first-channel.md) — nixie's own client holds the
  conversation, approvals and voice, and chat apps carry content-free pushes
- [0010: The memory store](./decisions/0010-memory-store.md) — memory as rows in nixie's database, a
  UI and a raw recall tool, and forgetting by crypto-shredding
- [0011: Which memory writes skip review](./decisions/0011-memory-writes.md) — writes from a clean
  main thread apply at once with undo, and every proposal is asynchronous
- [0012: High-risk approvals](./decisions/0012-high-risk-approvals.md) — a passkey check for the
  always-ask set, and a tap for everything else
- [0013: Definition versioning](./decisions/0013-definition-versioning.md) — a snapshot hash on
  every record, with rules applying at once and persona and jobs fixed per task
- [0014: Search](./decisions/0014-search.md) — Kagi, with full results that taint the main thread
- [0015: Where taint applies](./decisions/0015-taint-scope.md) — the conversation is always
  untrusted, and taint applies to jobs and workers in stages
- [0016: nixie's own interfaces](./decisions/0016-own-interfaces.md) — channel adapter, trigger
  source, connector and credential store, with tools from MCP
- [0017: Outside MCP servers](./decisions/0017-mcp-proxy.md) — every MCP server outside nixie's code
  goes through a proxy, the owner's own included
- [0018: The main thread and tasks](./decisions/0018-main-thread-and-tasks.md) — the owner works
  through the main thread, which routes work to tasks and shares a live view
- [0019: Connector authorization](./decisions/0019-connector-authorization.md) — each owner
  registers their own OAuth clients, and the Google spike runs early

## Research

Phase 2. Each track has a landscape doc with its findings and recommendations, and notes with the
evidence and sources.

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

Phase 1: what nixie is for and what binds it.

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
