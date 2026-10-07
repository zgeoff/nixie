# Anthropic

Report: 2.1.1

Anthropic offers agents at 3 layers: the Agent SDK runs the agent loop locally, Managed Agents runs
a hosted harness, and the consumer products cover Cowork, Dispatch, computer use, and Claude Code
routines. In the SDK, the order of the permission checks decides which check can be skipped. A
PreToolUse hook is the one check that runs in every permission mode, so nixie puts its policy there.
Managed Agents adds memory stores, vaults, budgets, and schedules, but runs the harness and tool I/O
through Anthropic, which rules it out for data nixie must hold itself. The security record includes
a Cowork exfiltration, a reported Cowork VM escape, and several Claude Code CVEs.

## Agent SDK

### Where it runs

The SDK runs the agent loop in the caller's own process.

- Transcripts are JSONL files under `~/.claude/projects/<cwd>/`.
- A SessionStore adapter puts sessions in shared storage, so a session can resume elsewhere.
- File checkpointing is separate from the transcripts.

### Input and interrupts

Streaming-input mode queues new user messages and supports interrupts. Single-message mode does
neither.

### Policy and approvals

The SDK evaluates permissions in this exact order:

1. hooks
2. deny rules
3. ask rules
4. permission mode
5. allow rules
6. `canUseTool`

A hook deny holds even in `bypassPermissions` mode. A hook allow does not skip the deny and ask
rules that come after it. A bare allow rule or `bypassPermissions` approves a call before
`canUseTool` runs, and the docs call this "silently bypassed", so put any check that must run in a
PreToolUse hook. The `dontAsk` mode turns every prompt into a deny.

The SDK never auto-approves a fixed set of actions:

- the `rm -rf ~` class of commands
- interactive tools
- connectors the organization marks as ask

The `updatedPermissions` result with the `localSettings` destination writes
`.claude/settings.local.json`. The SDK default `permissionMode` may be auto mode, so set the mode
explicitly.

A PreToolUse hook can return `defer`. The process then exits, and a later run resumes from the
session, which gives a route to durable approvals.

## Claude Code auto mode

Auto mode gates tool calls with a classifier, Sonnet 5 by default. The classifier sees user
messages, tool calls, and CLAUDE.md, and the harness strips tool results before the classifier sees
them. Auto mode ships with a default block list. It falls back to prompting after 3 consecutive
blocks or 20 total blocks.

Auto mode has gaps:

- Boundaries the user states in chat are not stored as rules, and compaction loses them.
- An approval cannot clear some blocks.

The engineering blog post of 2026-03-25 reports a 0.4% false-positive rate and reports that the
classifier missed 17% of overeager actions.

## Managed Agents

### Where it runs

Managed Agents models work as 4 resources: Agent, Environment, Session, and Events. Anthropic runs
the harness and the model. Tools run in a cloud sandbox or on a `self_hosted` worker, which pulls
work over outbound HTTPS. Tool I/O flows through the Anthropic control plane either way, and the
service is not covered by Zero Data Retention (ZDR) or HIPAA.

### Agent loop

The client redirects a running session with `user.interrupt` and `user.message` events. The server
stores events and does not replay them on reconnect, so a reconnecting client lists events and
deduplicates them. A session stops with `stop_reason` set to `requires_action` or `budget_reached`.

### Policy and approvals

Managed Agents sets a permission policy per tool: `always_allow`, `always_ask`, or `auto`. MCP tools
default to `always_ask`. The client cannot override a denial from `auto`.

- Only `user.message` counts as owner intent.
- Each tool event carries `evaluated_permission` and `evaluation.reason_code`.
- An approval is a `user.tool_confirmation` event, never a rule.

### Memory

Memory stores hold path-addressed text files at `/mnt/memory/<slug>`. The file system enforces the
`read_only` and `read_write` access modes.

| Limit              | Value  |
| ------------------ | ------ |
| Size per memory    | 100 kB |
| Memories per store | 10k    |
| Stores per session | 8      |

Every change creates an immutable version tied to the session. Anthropic keeps versions for 30 days
unless the owner exports them. A write can carry a `content_sha256` precondition. Anthropic warns
that prompt injection can poison a `read_write` store.

Dreaming, a research preview, reads a store and 1-100 transcripts and writes a new store for review.
Dreaming leaves the input store unchanged.

### Outcomes

An outcome is a markdown rubric that a separate grader scores. The loop runs 3 iterations by default
and 20 at most.

### Multi-agent

A coordinator delegates 1 level deep, to up to 20 agent definitions and 25 threads. The agents share
the sandbox and the vault credentials.

### Vaults

Vaults hold 2 kinds of credential:

- MCP OAuth tokens, which Anthropic refreshes
- static bearer tokens

Environment-variable credentials sit in the sandbox as placeholders. The egress path swaps in the
real value, scoped by `allowed_hosts` and by position in the header or body. Self-hosted sandboxes
do not support vaults yet.

### Budgets

Budgets use list-rate pricing. Reaching a budget pauses the session and never kills it. Spend can
overshoot by up to 1 request per thread.

### Schedules

Managed Agents schedules take a POSIX cron expression and an IANA time zone.

- Runs start with up to 9 minutes of jitter.
- A schedule never backfills missed runs.
- A schedule pauses itself on unrecoverable errors.
- Each attempt gets a run record.
- Schedules send webhooks.

## Consumer products

### Claude Code routines

Routines run on a schedule of 1 hour or longer, through the `/fire` API with a per-routine token, or
on GitHub events. Routines never show permission prompts. Claude Code wraps the fire payload in
`<routine-fire-payload>` as untrusted input, and that payload cannot act as an approval.

### Claude Code channels

Channels bring Telegram, Discord, and iMessage messages into an open session only. Pairing builds a
sender allowlist. Anyone on the allowlist can answer permission prompts.

### Cowork and Dispatch

Cowork runs each session in a cloud sandbox behind a mandatory egress proxy, or in a local
hypervisor VM. Dispatch keeps 1 continuous thread and needs the desktop to be awake.

### Consumer memory

- The Topics view lets users view and edit memory since 2026-07-10.
- Chat and cloud Cowork share memory since 2026-08-25.

### Sandbox runtime

The sandbox runtime combines bubblewrap or seatbelt with a proxy and is open source as
`sandbox-runtime`. It cut permission prompts by 84%.

## Security record

- PromptArmor reported a Cowork exfiltration through `/v1/files` in January 2026: the egress
  allowlist included Anthropic's own upload API.
- A Cowork VM escape named "SharedRoot" dates to 2026-07-23. A single secondary source reports it,
  and it is unverified.
- CVE-2025-59536 and CVE-2026-21852 are remote code execution through repository config in Claude
  Code.
- CVE-2026-24887 is a bypass through `find` parsing.
- CVE-2026-39861 is a symlink escape. The details come from search summaries.
- Computer use runs without a sandbox.
- The launch date of background computer use is unverified. A third party gives 2-3 September.

## What nixie borrows

- Put policy in a PreToolUse hook inside the SDK adapter.
- Set `permissionMode` explicitly, and never use a bare allow rule or `bypassPermissions`.
- Use hook `defer` with session resume for durable approvals.
- Keep remembered rules in a nixie-owned store.
- Shape decisions after `evaluated_permission` and `reason_code`.
- Keep immutable, attributed memory versions with unlimited retention.
- Write dreaming-style output to a new store for review.
- Mount memory read-only for untrusted tasks.
- Substitute secrets at egress, scoped by host and position.
- Wrap trigger payloads as untrusted.
- Never allowlist a provider's upload endpoints.
- Keep a set of actions that no approval can unlock.
- Follow Managed Agents budget semantics.
- Define agents in declarative files.

## What nixie avoids

- auto denials that the owner cannot override
- boundaries stated only in chat
- data hosted by the provider
- approvals that anyone on an allowlist can give
- routines that never prompt
