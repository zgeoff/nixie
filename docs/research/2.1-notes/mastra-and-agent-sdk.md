# Mastra + Claude Agent SDK report (2.1.3)

## Mastra @mastra/core 1.74.0 — verdict: not a skeleton; mine patterns; Chat SDK (vercel/chat, MIT) usable directly as channel layer
- Node >=22.13; Hono server + adapters; Bun not declared (past bugs closed).
- Storage domains: memory, workflows, observability, scores, backgroundTasks, schedules; LibSQL/Postgres/MySQL/Mongo...
- Durable agents (1.45, beta): workflow-wrapped loop, memoised steps, PubSub by runId, observe(runId). Open: #25891, #25960, #26086; fixed #20213, #24976, #25510.
- Signals (1.39 beta): sendMessage (inject/wake), queueMessage (next turn), cancel, abort+clear; sender attributes.
- Memory: history, working memory (markdown block), semantic recall, observational memory (Observer/Reflector; default model google/gemini-2.5-flash). No write review.
- Approval: requireApproval / requireToolApproval (bool or fn; durable agents bool only, fn -> approve all). Snapshots deleted after run; docs say store fingerprint yourself. Channel: message never counts as consent. ee/ dirs source-available.
- chat = Vercel Chat SDK: Slack, Teams, Google Chat, Discord, Telegram, WhatsApp, GitHub, Linear, iMessage.
- Schedules (1.50 beta): croner, persist, threadless vs threaded (signal into thread), pause/resume/run-now.
- @mastra/claude wraps Claude Agent SDK.
- Security: June 16-17 2026 @mastra npm scope compromise (116 packages, easy-day-js postinstall stealer; issue #18061; Snyk/StepSecurity; Sapphire Sleet). CVE-2026-82273 memory thread ownership no-op through 1.63.0 (fix unverified). #25893 bot tokens in trace spans. Telemetry: PostHog us.posthog.com hardcoded key, geoip on, sends counts/hashed host+path/OS/versions/token totals; off only via MASTRA_TELEMETRY_DISABLED (no DO_NOT_TRACK).
- Copy: send/queue/cancel/abort vocabulary; threadless vs threaded schedules; storage domains; channel message ≠ consent.

## Claude Agent SDK 0.3.291 — verdict: right runtime behind adapter; ~half of tier 1 is nixie's own code
- One subprocess (bundled claude CLI) per session over stdio; ~1 GiB/1 CPU/5 GiB floor. Bun works (bun build --compile needs extractFromBunfs()). NOT open source. Verified: package LICENSE.md reads "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements"; README points to the Commercial Terms.
- Streaming input priority: next (default, same turn after tools), later (new turn), now (moves backgroundable work aside / interrupts); shouldQuery:false appends context; interrupt() receipt lists pending.
- SessionStore append/load mirror (reference adapters only), best-effort: local JSONL first, 3 tries, dropped batches -> mirror_error, dedupe by uuid; keyed by cwd; conflicts with persistSession:false and file checkpointing. 0.3.290: restarted worker resumes from permission answer / in-flight tool calls (scope unverified).
- File checkpointing: Write/Edit/NotebookEdit only.
- Memory: CLAUDE.md + auto memory files (~/.claude/projects/<p>/memory/), auto memory loads regardless of settingSources.
- Permissions: hooks -> deny -> ask -> mode -> allow -> canUseTool. PreToolUse is enforcement point. Default mode can be auto since v0.3.286 -> set dontAsk/default. Subagents inherit bypassPermissions. defer: process exits tool_deferred, resume later. Verified against code.claude.com/docs/en/hooks: only the first tool call in a turn can be deferred; a later defer is treated as "ask" (so under dontAsk it becomes a deny). Session files swept after 30 days default. No approval records.
- maxBudgetUsd: client-side estimate, current call only, not a hard stop -> meter at a model proxy via ANTHROPIC_BASE_URL.
- No channels/scheduler/identity built in; Notification and PermissionRequest hooks.
- MCP: stdio, HTTP/SSE, in-process createSdkMcpServer; _meta["anthropic/requiresUserInteraction"]; bare-name allow rules approve whole tool. settingSources: [] to avoid loading disk config.
- Telemetry on by default; DISABLE_TELEMETRY / CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC.
- ~33 GHSAs 2025-06..2026-10: command-validation bypasses (CVE-2025-54795, -64755, 2026-24887, -25722), trust-dialog bypasses (2026-33068, -40068, -21852 ANTHROPIC_BASE_URL leak), sandbox escapes (2026-39861, -55607), pre-approved domain exfil (2026-54316), symlink TOCTOU (2026-103435). Lesson: in-runtime rule matching is defence in depth only.
- Copy: PreToolUse -> external engine, permissionMode dontAsk, settingSources []; defer+resume for durable approvals (one tool per turn or deny-and-retry); priority input; SessionStore into owner Postgres + mirror_error alerting; egress proxy + credential injection. Avoid: maxBudgetUsd as stop; rules as boundary; telemetry/auto memory on; unpinned SDK.
