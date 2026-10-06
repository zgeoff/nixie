# Architecture writing

Published essays and papers describe 5 architecture models for always-on agents, from a stateless harness over a session log to provable dual-LLM designs. The defences that hold up against prompt injection work outside the model: breaking the lethal trifecta, reference monitors, and credentials kept out of the sandbox. In-band detection alone fails. Builders converge on a small readable core and plain markdown memory, and nixie draws its policy, memory, and durability rules from both bodies of writing.

openai.com, help.openai.com, and Axios returned 403 during the research, so every claim here about Dots or Atlas rests on third-party sources only.

## Architecture models

| Model | Example | Source |
| --- | --- | --- |
| Session log, stateless harness, lazy disposable sandbox | Anthropic Managed Agents | "Scaling Managed Agents", Anthropic, April 2026 |
| Gateway, per-session container, credential-injecting egress proxy | NanoClaw | github.com/nanocoai/nanoclaw |
| Dual LLM, plan-then-execute, or code-then-execute with capability or taint tracking | CaMeL, FIDES | arXiv 2506.08837, arXiv 2505.23643 |
| Event-sourced durable execution | DBOS, Restate, Temporal | Snippets only |
| In-band classifier gate | Claude Code auto mode | Anthropic, March 2026 |

### Session log and stateless harness

Anthropic calls this split "brain/hands/memory". After a crash, `wake(sessionId)` and `getSession` rebuild the session from the log. Credentials never enter the sandbox. A vault sits behind a proxy that takes only the session token. Anthropic reports that the design cut p50 time to first token (TTFT) by 60%.

### Gateway and per-session container

NanoClaw has this "Claw" shape. NanoClaw is about 4k lines built on the Claude Agent SDK. Its containers run as non-root with fixed mounts, and config and `CLAUDE.md` are mounted read-only. Approval lives in the core, and every failure path denies. The Anthropic sandboxing post argues that an agent needs both filesystem isolation and network isolation.

### Dual LLM and capability tracking

The design patterns paper by Beurer-Kellner, Tramèr, and others (arXiv 2506.08837) describes 6 patterns. CaMeL scores 77% on AgentDojo with provable guarantees. FIDES (arXiv 2505.23643) takes the same approach. The cost of these designs is lost utility, the work of writing policy, and approval fatigue.

### Event-sourced durable execution

DBOS, Restate, and Temporal follow this model; the research read snippets only. The engine records each LLM output once and replays it. Workflow code is deterministic, side effects are idempotent, and large payloads are offloaded.

### In-band classifier gate

Claude Code auto mode, from March 2026, combines a server-side probe with a transcript classifier. The classifier is reasoning-blind: it sees only user messages and tool payloads. Anthropic reports a 0.4% false-positive rate, a 17% false-negative rate on overeager actions, and a 5.7% false-negative rate on synthetic exfiltration.

Third-party sources describe Dots with the same shape: auto-review, read-only proactive research, credentials invisible to the model, a cloud computer per dot, tasks reserved for humans, and a kill switch that OpenAI holds.

## Prompt-injection defences

In-band detection alone fails. "The Attacker Moves Second" (arXiv 2510.09023) broke 12 defences at rates above 90%. Model hardening is probabilistic: Opus 4.5 sits around 1% under best-of-N (BoN) attacks, and the claims of 0% and 3.7% for Opus 5 are unverified.

These defences hold better:

- Break the lethal trifecta (Willison), or apply the Meta Rule of Two. Even under the Rule of Two, untrusted input combined with a state change is still not "safe".
- Use out-of-band reference monitors: CaMeL, FIDES, and Progent. The Progent result, a drop from 25.8% to 4.2%, comes from 1 weak test.
- Keep credentials outside the sandbox, and send egress through a proxy.
- Derive context from metadata, such as the chat ID, rather than from content.

Memory poisoning is the gap. arXiv 2606.04329 finds that current defences do not cover it, and that agents that write memory aggressively are more exploitable. "Taming OpenClaw" (arXiv 2603.11619) covers the same ground.

## Lessons from builders

A small readable core works. The sources are NanoClaw at about 4k lines, an endorsement from Karpathy, and Okhlopkov.

Plain markdown memory won, according to Bustamante's "Agent Memory Engineering" from May 2026. His lessons:

- Load an index every turn and load bodies lazily.
- Freeze a memory snapshot per session.
- Default memory writes to no-op.
- Label each memory with its age.
- Expect a cold start of about 10 sessions.
- Watch for leakage across projects.

NanoClaw keeps an `index.md` plus a definition file capped at 16k characters.

Okhlopkov describes the design as an immutable body with a mutable brain. His problems were Telegram FloodWait errors, memory bloat, git conflicts, and critical rules lost at compaction. The fix for lost rules is to keep rules in the system prompt rather than in memory, and secrets never become memory.

NanoClaw ships `EGRESS_LOCKDOWN` off by default in `src/config.ts`: the secure option exists, but the default is insecure.

Willison: "A Claw is really just a coding agent wearing a less threatening hat."

## What this means for nixie

- The owner holds the kill switch and the spend stop, outside the runtime. Dots, by contrast, gives the kill switch to the vendor.
- The record is an append-only event log, so the record and recovery come from one source.
- The policy engine sees only owner messages and action payloads, never agent prose.
- Policy sits at the tool and proxy boundary, keyed on provenance labels. An LLM classifier may only add a deny, never an allow, and no classifier sits in the gate for catastrophic actions.
- Owner rules never live in memory or in context that compaction can drop.
- Each task obeys the Rule of Two. Proactive work is read-only, and reader tasks get no network route. Lockdown is on by default, and the system fails closed.
- Context comes from channel metadata. A fixed list of actions always goes to a human. Repeated denials escalate.
- Memory writes are privileged. They pass through policy with their provenance, and writes derived from untrusted input wait in quarantine for review.
- Durability comes from recording and replaying LLM outputs. Every side-effecting call carries an idempotency key, and the key goes in the decision record.
- Proactive pushes run under a notification budget of about 3 to 5 a day, set as owner policy. The source for that number is thin.

## Reading list

- Simon Willison on the lethal trifecta (simonwillison.net)
- Simon Willison's post on the Rule of Two papers (simonwillison.net)
- Meta, practical AI agent security (ai.meta.com/practical-ai-agent-security)
- arXiv 2510.09023, "The Attacker Moves Second"
- arXiv 2506.08837, design patterns for securing LLM agents
- arXiv 2503.18813
- arXiv 2505.23643, FIDES
- arXiv 2606.04329, memory poisoning
- anthropic.com/engineering/managed-agents
- anthropic.com/engineering/claude-code-auto-mode
- anthropic.com/engineering/claude-code-sandboxing
- github.com/nanocoai/nanoclaw
- nicolasbustamante.com/blog/agent-memory-engineering
- okhlopkov.com/always-on-ai-agent-server-setup
- techbytes.app, on Dots safety
