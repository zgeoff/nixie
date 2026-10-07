# Hermes Agent

Code pinned at commit baef00bf on 2026-10-06, from github.com/NousResearch/hermes-agent.

Hermes Agent is a single-tenant Python agent from Nous Research that runs one `AIAgent` loop behind
every entry point: a command-line interface (CLI), a terminal UI (TUI), a gateway with at least 25
adapters, Agent Client Protocol (ACP), an API server, cron, and a desktop app. It runs self-hosted,
on the desktop, or as Hermes in the Cloud through Nous Portal. Its strongest designs are an
append-only skill ledger with per-entry rollback, hard size caps on memory, and honest restart
semantics that record unprovable side effects as `unknown`. Its weakest choices are an auxiliary
large language model (LLM) that decides approvals by default, container backends that skip the
approval gate, and extensions that run in-process with full privilege. Its own SECURITY.md states
that only OS-level isolation counts as a security boundary.

## Where it runs

Hermes runs as one process. Tools execute in a thread pool, and subagents run in-process. 7 terminal
backends execute commands:

- local, the default, which runs on the host
- Docker
- SSH
- Modal
- Daytona
- Singularity
- Vercel Sandbox

State lives under `~/.hermes/`:

- `state.db`, a SQLite database with FTS5 full-text search that holds sessions, messages, turn
  leases, routing, and async delegations
- `memories/MEMORY.md` and `memories/USER.md`
- `skills/`
- `cron/jobs.json`
- `config.yaml`
- `.env`, or a 1Password, Bitwarden, or command helper in its place

## Agent loop

A run lasts up to 500 iterations. Lossy compression moves the conversation into a child session.

The setting `busy_input_mode` decides what happens to a message that arrives mid-run:

- interrupt, the default, abandons the current call
- queue holds the message
- steer injects the message after the next tool call

The commands `/approve`, `/deny`, and `/stop` bypass the busy guard. `/goal` runs a loop judged by a
separate model. Kanban workers and `/heartbeat` are available.

## Restart behaviour

Hermes marks sessions cut off by a restart as `restart_interrupted`. Such a session resumes from its
last committed turn, and only after the next user message. When a delegation's owner dies, Hermes
records the delegation as `unknown`, because it cannot prove whether side effects happened. Hermes
has no step-level resume and no idempotency keys.

## Memory

- `MEMORY.md` is capped at 2,200 characters and `USER.md` at 1,375 characters, with entries split by
  section sign (U+00A7) separators.
- A write to a full file fails, and the agent then consolidates the file.
- Hermes injects a frozen snapshot of memory at session start to keep the prompt cache stable.
- `session_search` searches past sessions over FTS5.
- Setting `memory.write_approval: true` stages writes for `/memory approve` or `/memory reject`.
  Staging is opt-in.
- Hermes scans memory writes for prompt injection and invisible Unicode.
- `hermes journey list|edit|delete` gives the owner a timeline of memory to list, edit, and delete.
- External memory providers include Honcho, Mem0, and OpenViking.

## Learning loop and curator

The learning loop reviews memory every 10 user turns and reviews skills after 10 tool iterations.
The review runs in a background fork that cannot write the session database. Cron sessions skip the
review.

A weekly curator ages and archives skills, and it can optionally merge them. The curator writes an
append-only JSONL ledger at `~/.hermes/skills/.curator_ledger.jsonl`. Each entry records the actor,
the action, and the sha256 hashes before and after, and each entry supports rollback on its own. LLM
consolidation is off by default.

## Policy and approvals

`tools/approval.py` evaluates a command through 3 stages in order:

1. A hardline blocklist that nothing can override.
2. The owner's `approvals.deny` globs, checked before YOLO mode applies.
3. Dangerous-command regexes, handled by the approval mode.

The approval mode is one of:

- smart, the default, where an auxiliary LLM decides
- manual
- off, which is YOLO mode

Headless runs deny by default. Container backends skip the gate entirely. An approval prompt times
out after 300 s and fails closed. An approval lasts once, for the session, or always, and an always
approval adds the command to `command_allowlist` in `config.yaml`. Hermes keeps no approvals table;
`hermes approvals suggest` mines messages instead.

SECURITY.md, rewritten on 2026-05-05, states that only OS-level isolation counts as a security
boundary.

No local hard cap in USD was found. Hermes limits runs by iteration and wall-clock budgets, and Nous
Portal applies a monthly cap.

## Channels and triggers

- The gateway admits callers through allowlists and direct-message (DM) pairing, and all allowed
  callers are equal.
- The session key is `agent:{profile}:{platform}:{chat_type}:{chat_id}`, so Hermes has no identity
  that spans channels.
- The agent can create its own cron jobs.
- `no_agent` cron jobs run a script without the agent.
- `hermes pause` stops everything globally.
- Webhooks and the API start work.
- Voice works in the CLI, Telegram, and Discord, with a wake word, and the desktop app supports
  full-duplex barge-in.

## Extension model

- Hermes ships more than 70 tools.
- Skills follow the `SKILL.md` format from agentskills.io.
- The hub draws on skills.sh, ClawHub, and LobeHub.
- Plugins and hooks extend the agent.
- The Model Context Protocol (MCP) client has sampling and elicitation on by default.
- Extensions run in-process with full privilege.
- Skills Guard screens skills with regexes.
- Hermes wraps untrusted tool results in delimiters.

## Security record

- Issue #7826, dated 2026-04-11 against v0.8.0, reports 4 Critical and 9 High findings. It is still
  open with 0 comments, and the project answered it with the policy rewrite.
- The project has 10 GitHub Security Advisories (GHSAs). They include CVE-2026-53869, a DNS
  rebinding flaw in the WebSocket server rated high and fixed in 0.16.0, and CVE-2026-53870, a
  world-readable `response_store.db`.
- vuln.today lists 39 CVEs, with stale labels.
- CVE-2026-82021, rated 9.0, is a remote code execution (RCE) flaw through an MCP catalog that
  pinned a mutable branch. It was fixed in 0.19.0 (v2026.7.20).
- CVE-2026-71963 is an RCE through `core.fsmonitor` in `.git/config`.
- CVE-2026-82020 is a path traversal that overwrites the credential store.
- The CSA note was AI-assisted and is unreviewed.
- The iron-proxy egress proxy is opt-in and works only with Docker.

## Worth borrowing

- an append-only mutation ledger with actor, hashes, and rollback, extended to policy and approvals
- hard memory caps, staged memory writes by default, and an owner-facing timeline
- an unoverridable blocklist, owner deny rules checked before any allow-all mode, and timeouts that
  fail closed
- the OS boundary as the only boundary, plus a mandatory egress credential proxy
- steer, queue, and interrupt modes for mid-run input
- `restart_interrupted` resumption and honest `unknown` outcomes
- a global pause
- `no_agent` script jobs

## Worth avoiding

- LLM-decided approvals
- container backends that skip the approval gate
- approvals stored as config patterns
- in-process extensions with full privilege
- delimiter wrapping as a defence
- host networking by default
- skills and cron jobs that the agent writes without review
- shipped persona files and skills
- no spending stop
