# Mastra and the Claude Agent SDK

Report: 2.1.3

Mastra is a TypeScript agent framework, and the Claude Agent SDK is Anthropic's packaged agent
runtime. Mastra is not a skeleton for nixie, but its patterns are worth mining, and its chat layer,
the Vercel Chat SDK, works directly as nixie's channel layer. The Claude Agent SDK is the right
runtime for nixie behind an adapter, and nixie writes about half of tier 1 itself. The SDK enforces
policy reliably only at the PreToolUse hook, and its security record shows that its in-runtime rule
matching is defence in depth, never the boundary.

## Mastra

The findings cover `@mastra/core` 1.74.0.

### Where it runs

- Mastra requires Node 22.13 or later.
- The server is Hono, with adapters for other servers.
- Mastra does not declare Bun support. Past Bun bugs are closed.
- The Enterprise Edition `ee/` directories are source-available.

### Storage

Mastra splits storage into domains:

- memory
- workflows
- observability
- scores
- background tasks (`backgroundTasks`)
- schedules

Backends include LibSQL, Postgres, MySQL, and Mongo, among others.

### Agent loop

Durable agents, in beta since 1.45, wrap the agent loop in a workflow. The workflow memoises steps
and publishes events over PubSub keyed by `runId`. A client follows a run with `observe(runId)`.

Durable agents have these issues:

- open: #25891, #25960, #26086
- fixed: #20213, #24976, #25510

Signals, in beta since 1.39, act on a running agent, and each signal carries sender attributes.

- `sendMessage` injects a message and wakes the agent.
- `queueMessage` holds a message for the next turn.
- The remaining signals are cancel and abort-plus-clear.

### Memory

Mastra memory has 4 kinds:

- message history
- working memory, a markdown block
- semantic recall
- observational memory, run by an Observer and a Reflector, with `google/gemini-2.5-flash` as the
  default model

Mastra never reviews memory writes.

### Policy and approvals

An agent turns on approvals with `requireApproval` or `requireToolApproval`, which take a boolean or
a function. Durable agents accept only the boolean, and passing a function to a durable agent
approves every call. Mastra deletes approval snapshots after the run, and the docs tell you to store
a fingerprint yourself. Mastra never counts a channel message as consent.

### Channels and triggers

The `chat` package is the Vercel Chat SDK (`vercel/chat`, MIT). It connects to these platforms:

- Slack
- Teams
- Google Chat
- Discord
- Telegram
- WhatsApp
- GitHub
- Linear
- iMessage

Schedules, in beta since 1.50, run on croner and persist. A threadless schedule runs on its own, and
a threaded schedule sends a signal into an existing thread. Schedules support pause, resume, and
run-now.

The `@mastra/claude` package wraps the Claude Agent SDK.

### Security record

- The `@mastra` npm scope was compromised on 16-17 June 2026. The attack hit 116 packages with an
  `easy-day-js` postinstall stealer. Issue #18061 tracks it, Snyk and StepSecurity reported it, and
  the attribution is Sapphire Sleet.
- CVE-2026-82273: the memory thread ownership check is a no-op through 1.63.0. The fix is
  unverified.
- Issue #25893: bot tokens leak into trace spans.

Telemetry goes to PostHog at `us.posthog.com` with a hardcoded key and geoip turned on. Mastra sends
counts, hashed host and path, OS, versions, and token totals. Only `MASTRA_TELEMETRY_DISABLED` turns
telemetry off, and Mastra ignores `DO_NOT_TRACK`.

### Worth borrowing

- the send, queue, cancel, and abort vocabulary
- threadless and threaded schedules
- storage domains
- the rule that a channel message is never consent

## Claude Agent SDK

The findings cover version 0.3.291.

### Where it runs

The SDK runs 1 subprocess per session, the bundled `claude` CLI, and talks to it over stdio. The SDK
needs about 1 GiB, 1 CPU, and 5 GiB at minimum. Bun works, and `bun build --compile` needs
`extractFromBunfs()`.

The SDK is not open source. The package `LICENSE.md` reads "© Anthropic PBC. All rights reserved.
Use is subject to the Legal Agreements", and the README points to the Commercial Terms; both were
checked directly and are verified. Anthropic's legal and compliance page still permits a product to
preinstall and run Claude Code, if the binary stays unmodified and each end user authenticates with
their own key or plan.

### Agent loop

Streaming input takes a priority on each message:

- `next`, the default, delivers in the same turn after the running tools finish.
- `later` delivers in a new turn.
- `now` moves backgroundable work aside or interrupts.

A message with `shouldQuery: false` appends context without starting a query. The `interrupt()`
receipt lists the pending messages.

### Sessions

SessionStore mirrors sessions through append and load calls, and only reference adapters exist. The
mirror is best-effort:

1. The SDK writes local JSONL first.
2. The SDK tries the mirror 3 times.
3. The SDK reports dropped batches as `mirror_error`.
4. The store deduplicates by `uuid`.

SessionStore keys sessions by `cwd`. It conflicts with `persistSession: false` and with file
checkpointing. Since 0.3.290, a restarted worker resumes from a permission answer or from in-flight
tool calls; the scope of that resume is unverified.

File checkpointing covers only Write, Edit, and NotebookEdit.

The SDK sweeps session files after 30 days by default.

### Memory

The SDK loads CLAUDE.md and auto memory files from `~/.claude/projects/<p>/memory/`. Auto memory
loads regardless of `settingSources`.

### Policy and approvals

The SDK evaluates permissions in the order hooks, deny rules, ask rules, permission mode, allow
rules, then `canUseTool`. The PreToolUse hook is the enforcement point.

- The default mode can be auto mode since v0.3.286, so set `dontAsk` or `default` explicitly.
- Subagents inherit `bypassPermissions`.
- A `defer` from a hook makes the process exit with `tool_deferred`, and a later run resumes.
- The SDK keeps no approval records.

`defer` works only in a `-p` run, and only when Claude makes a single tool call in the turn. When
Claude makes several tool calls at once, Claude Code ignores the `defer` with a warning, and the
call goes through the normal permission flow. This behavior is verified against
`code.claude.com/docs/en/hooks`, in the section on deferring a tool call.

### Budgets

`maxBudgetUsd` is a client-side estimate that covers only the current call, and it is not a hard
stop. Meter spend at a model proxy reached through `ANTHROPIC_BASE_URL` instead.

### Channels and triggers

The SDK has no built-in channels, scheduler, or identity. It offers Notification and
PermissionRequest hooks.

### Extension model

- MCP servers connect over stdio, HTTP or SSE, or in-process through `createSdkMcpServer`.
- A tool can set `_meta["anthropic/requiresUserInteraction"]`.
- A bare-name allow rule approves the whole tool.
- `settingSources: []` stops the SDK from loading config from disk.

### Telemetry

Telemetry is on by default. `DISABLE_TELEMETRY` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` turns
it off.

### Security record

About 33 GitHub Security Advisories (GHSAs) appeared between June 2025 and October 2026.

- Command-validation bypasses: CVE-2025-54795, CVE-2025-64755, CVE-2026-24887, CVE-2026-25722.
- Trust-dialog bypasses: CVE-2026-33068, CVE-2026-40068, and CVE-2026-21852, an `ANTHROPIC_BASE_URL`
  leak.
- Sandbox escapes: CVE-2026-39861, CVE-2026-55607.
- Pre-approved domain exfiltration: CVE-2026-54316.
- Symlink time-of-check to time-of-use (TOCTOU): CVE-2026-103435.

The lesson is that in-runtime rule matching is defence in depth only.

### Worth borrowing

- Route PreToolUse to an external policy engine, with `permissionMode` set to `dontAsk` and
  `settingSources` set to `[]`.
- Use `defer` and resume for durable approvals, and deny any batch of tool calls that holds a call
  that needs approval, so that Claude retries that call alone.
- Use priority input.
- Point SessionStore at the owner's Postgres and alert on `mirror_error`.
- Run an egress proxy with credential injection.

### Worth avoiding

- `maxBudgetUsd` as a stop
- permission rules as the boundary
- telemetry or auto memory left on
- an unpinned SDK version
