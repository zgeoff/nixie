# Cross-cutting essays report (2.1)

Note: openai.com / help.openai.com / Axios 403 -> Dots/Atlas claims third-party only.

## Architecture models
a. Session log + stateless harness + lazy disposable sandbox ("brain/hands/memory") — Anthropic "Scaling Managed Agents" (Apr 2026). wake(sessionId)+getSession rebuild after crash. Creds never in sandbox; vault behind proxy taking only session token. p50 TTFT -60%.
b. Gateway + per-session container + credential-injecting egress proxy ("Claw" shape) — NanoClaw (github.com/nanocoai/nanoclaw, ~4k lines, Claude Agent SDK). Non-root containers, fixed mounts, config/CLAUDE.md read-only, approval in core, every failure path denies. Anthropic sandboxing post: need both FS and network isolation.
c. Dual LLM / plan-then-execute / code-then-execute w/ capability/taint — Beurer-Kellner/Tramèr design patterns (arXiv 2506.08837; 6 patterns); CaMeL (77% AgentDojo, provable); FIDES (arXiv 2505.23643). Cost: utility, policy writing, approval fatigue.
d. Event-sourced durable execution (DBOS, Restate, Temporal; snippets only): record LLM output once & replay; deterministic workflow code; idempotent side effects; payload offloading.
e. In-band classifier gate — Claude Code auto mode (Mar 2026): server probe + transcript classifier, reasoning-blind (sees user msgs + tool payloads only); 0.4% FP, 17% FN overeager, 5.7% synthetic exfil. Dots same shape (third-party): auto-review, read-only proactive research, creds invisible, per-dot cloud computer, human-only tasks, OpenAI-held kill switch.

## Injection defences
Fail: in-band detection alone — "The Attacker Moves Second" (arXiv 2510.09023): 12 defences broken >90%. Hardening probabilistic (Opus 4.5 ~1% BoN; Opus 5 0%/3.7% claims unverified).
Hold better: break the trifecta (Willison) / Meta Rule of Two (untrusted input + state change still not "safe"); out-of-band reference monitors (CaMeL, FIDES, Progent 25.8%->4.2% one weak test); creds outside sandbox + egress via proxy; context from metadata (chat ID) not content.
Gap: memory poisoning (arXiv 2606.04329: defences don't cover; aggressive writers more exploitable); Taming OpenClaw (arXiv 2603.11619).

## Builder lessons
- Small readable core (NanoClaw ~4k lines; Karpathy endorsement; Okhlopkov).
- Plain markdown memory won (Bustamante "Agent Memory Engineering" May 2026): always-loaded index + lazy bodies; freeze snapshot per session; default to no-op writes; label memory age; cold start ~10 sessions; cross-project leakage. NanoClaw: index.md + definition file capped 16k chars.
- Immutable body, mutable brain (Okhlopkov). Problems: Telegram FloodWait, memory bloat, git conflicts, critical rules lost at compaction -> rules in system prompt not memory; secrets never become memory.
- NanoClaw EGRESS_LOCKDOWN off by default (src/config.ts) — secure option, insecure default.
- Willison: "A Claw is really just a coding agent wearing a less threatening hat."

## For nixie
- Owner-held kill switch + spend stop outside runtime (vs Dots vendor kill switch).
- Record = append-only event log (record + recovery from one source). Policy engine sees only owner messages + action payloads, never agent prose.
- Policy at tool/proxy boundary keyed on provenance labels; LLM classifier may only add deny, never allow; no classifier in catastrophic gate.
- Owner rules never in memory or compactable context.
- Rule of Two per task; proactive work read-only; reader tasks no-route network; lockdown on by default, fail closed.
- Context from channel metadata. Fixed always-human list. Escalate after repeated denials.
- Memory writes are privileged: through policy with provenance; untrusted-derived writes quarantined for review.
- Durable: record/replay LLM outputs; idempotency key on every side-effecting call, in decision record.
- Proactive pushes: notification budget (~3-5/day) as owner policy (thin source).

Reading list URLs in agent message: simonwillison.net lethal trifecta; Rule of Two papers post; ai.meta.com practical-ai-agent-security; arXiv 2510.09023, 2506.08837, 2503.18813, 2505.23643, 2606.04329; anthropic.com/engineering/managed-agents, claude-code-auto-mode, claude-code-sandboxing; github.com/nanocoai/nanoclaw; nicolasbustamante.com/blog/agent-memory-engineering; okhlopkov.com/always-on-ai-agent-server-setup; techbytes.app dots safety.
