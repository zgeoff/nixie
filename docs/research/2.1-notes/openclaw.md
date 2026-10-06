# OpenClaw

Code read at commit 27d3746 on main on 2026-10-06, package version 2026.9.8. The docs live at
docs.openclaw.ai and the code at github.com/openclaw/openclaw.

OpenClaw is a single-user Node and TypeScript Gateway daemon that connects about 40 channel plugins
to an in-repo agent runtime. It keeps its state in SQLite and markdown files under `~/.openclaw`,
and it stores secrets unencrypted with file mode 0600. Its strongest designs are memory provenance
that the model cannot write, approvals bound to the exact request, and write-only secrets that an
egress proxy substitutes per destination. Its weakest defaults are sandboxing off, in-process
plugins without a sandbox, and no hard spending stop. Its security record runs to 722 advisories,
including an exploited chain from token theft to remote code execution (RCE).

## Where it runs

- The Gateway listens on WebSocket and HTTP at `127.0.0.1:18789` by default, and remote access goes
  through Tailscale or SSH.
- About 40 channel plugins connect to the Gateway.
- The runtime began as Mario Zechner's pi (pi-mono) and is now the in-repo package
  `@openclaw/agent-core`. The repo states: "No external agent framework packages remain".
- Codex app-server, a claude-cli backend, and Agent Client Protocol (ACP) children are optional
  backends.
- Sandboxing through Docker, Podman, SSH, OpenShell, or Crabbox is off by default.

## State and durability

State lives under `~/.openclaw`:

- `openclaw.json` for configuration
- `state/openclaw.sqlite`, plus a SQLite database per agent
- transcripts
- a markdown `workspace/`

The store is database-first on SQLite with Kysely (PR #78595). Secrets are not encrypted at rest;
they rely on file mode 0600.

SQLite holds transcripts, cron, subagents, the outbound delivery queue, and a restart sentinel.
After a restart, interrupted main-session turns resume, and the Gateway drains pending deliveries
without resending them. Shutdown drains gracefully. Open pseudo-terminals (PTYs) are lost. Remote
procedure calls (RPCs) with side effects require idempotency keys. The compaction mode "safeguard"
audits the summary it produces.

## Agent loop

The agent RPC returns a `runId`, and each session runs in its own lane. Transcript writes go through
a writer claim on `activeWriterRunId`, which rejects writes from any run that no longer holds the
claim.

Queue modes decide what happens when a message arrives mid-run:

- steer (the default)
- followup
- collect
- interrupt

Steering never cancels a running tool. OpenClaw skips the rest of a sequential tool batch, records
synthetic "Skipped" results for the skipped calls, and injects the new message before the next model
call. One exception: OpenClaw never skips a parallel batch. `agent-loop-steering.ts` holds this
logic.

## Memory

Memory is a set of markdown files, and OpenClaw states "no hidden state":

- `AGENTS.md`, which only a human edits
- `MEMORY.md`
- `USER.md`
- `memory/YYYY-MM-DD.md` daily files
- `DREAMS.md`, kept for review

A SQLite index carries provenance columns that the model cannot write. The origin column takes
owner, agent, untrusted, or system, and an unknown origin never counts as owner. Cron, heartbeat,
and subagent sessions cannot produce durable memory candidates, and OpenClaw never re-extracts
recalled content.

Turn taint (`turn-taint.ts`) marks a turn that received network-sourced tool results. OpenClaw uses
the taint only for memory, never for tool gating.

Dreaming runs in light, REM, and deep phases and is the only automatic writer to `MEMORY.md`. It
keeps the preimage of every rewrite. The command `memory forget --session` removes a session's
memories with lineage and supports a dry run.

## Policy and approvals

OpenClaw layers several controls:

- tool profiles with allow and deny lists, where deny wins and every removal is logged
- the sandbox
- elevated mode
- exec approvals, which the execution host enforces

The permission modes are:

- read-only
- guarded, where a human approves
- workspace, where a large language model (LLM) reviewer approves
- full

The configuration defines a `decisionModel` role.

Approvals 2.0 stores each approval as a durable record bound to the exact request: argv, cwd, the
executable's realpath and hash, the session, and the person. The first valid answer wins. Approval
records use a SQLite compare-and-swap. Cron jobs get revocable standing grants recorded in a ledger.
A free-text "yes" never authorises anything.

`security.installPolicy` runs an owner command before any skill or plugin install and fails closed.

The audit ledger is metadata-only and content-free, and it keeps 30 days. Logging of exec identity
and of messages is off by default.

## Owner identity

- Direct-message (DM) pairing uses an 8-character code that expires after 1 hour, with at most 3
  pending codes.
- Allowlists limit who reaches the agent.
- Groups are mention-gated.

## Triggers, devices, and voice

- Cron jobs target a session.
- The heartbeat runs every 30 minutes by default, and OpenClaw suppresses a reply of `HEARTBEAT_OK`.
  Event wakes are rate-limited to one per 30 s.
- Webhooks, Gmail and IMAP hooks, and standing intents start work.
- Nodes pair with a signed device identity and expose camera, location, screen, and `system.run`.
- Voice Talk mode supports barge-in through `interruptOnSpeech`. Voice Wake and a voice-call plugin
  round out voice.

## Extension model

- Skills are `SKILL.md` folders.
- ClawHub distributes skills with an `origin.json`. `skills verify` checks a trust envelope, and
  ClawHub runs VirusTotal and ClawScan.
- Native plugins run in-process and are not sandboxed. A `before_tool_call` hook can block a call.
- The Model Context Protocol (MCP) client keeps durable per-tool grants, and OpenClaw offers
  `mcp serve`.

## Secrets and spending

Protected secrets are write-only. A destination-bound egress proxy substitutes them for sentinels on
the way out.

OpenClaw has no hard spending stop; the only cap is LiteLLM `max_budget`.

## Security record

- The "512 findings" figure comes from an Argus scanner dump in issue #1796, not from the Kaspersky
  audit. It held 8 critical findings, and Steinberger disputed some.
- CVE-2026-25253, called ClawBleed, chains the `gatewayUrl` query parameter to a token leak and then
  to RCE. Release 2026.1.29 fixed it under GHSA-g8p2-7wf7-98mq, and it was exploited.
- CVE-2026-32922, CVSS 9.9, escalates from pairing to admin to `system.run` through
  `device.token.rotate`. Release 2026.3.11 fixed it; the advisory id is approximate, believed to be
  GHSA-4jpw-hj22-2xmc. 5 further critical scope escalations followed between Mar 13 and Mar 29.
- Advisories total 722, of which 14 are critical and 249 high. They peaked at 220 in February, fell
  to 0 in July and August, and reached 75 in September.
- ClawHavoc found 341 malicious skills out of 2,857, of which 335 delivered AMOS. The bar to publish
  was a GitHub account 1 week old. Later counts are unverified.
- SecurityScorecard counted exposed instances rising from 28,663 to 40,214 IPs, with 12,812 open to
  RCE. A claim of 135k to 220k exposed instances conflicts with these counts.
- OpenClaw closes attack chains that rely on prompt injection alone as by design.

## What nixie copies

- memory provenance columns that the model cannot write
- durable approvals bound to the exact request, with no free-text consent
- write-only secrets with destination-bound egress substitution
- writer-claim checks, idempotency keys, and a SQLite delivery queue
- steering semantics with synthetic skipped results
- an owner install-policy hook that fails closed

## What nixie avoids

- an LLM in the policy path
- taint tracking used only for memory
- sandboxing off by default
- the `sessions_send` and `sessions_spawn` routes inside the sandbox
- a metadata-only audit ledger kept 30 days
- in-process plugins without a sandbox, fed from an open registry
- shipped persona files such as `SOUL.md`
- no spending stop
