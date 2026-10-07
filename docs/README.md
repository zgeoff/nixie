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

### Still to come

Tracks 2.4 memory and data, 2.5 channels and voice, and 2.6 connectors and deployment, as the
[research brief](./brainstorm/1.6-research-brief.md) sets out.

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
