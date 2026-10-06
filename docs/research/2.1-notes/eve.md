# eve report (2.1.3)

Verdict: do not adopt eve as the skeleton; copy its contracts.

Facts (sources in agent report):
- eve@0.71.2; 228 releases 2026-06-09..2026-10-05 (~65 minors). Node >= 24, Nitro 3 beta, ai@^7 peer. Bun unsupported (issue #101).
- Self-host: Nitro server; local world .eve/.workflow-data or @workflow/world-postgres; @workflow/* 5.0.0-beta protocol.
- Step = model call + inline tools; completed steps replayed; interrupted step re-runs up to 4x -> idempotency needed.
- turnPolicy "steer" (interrupt generation before output; running tool finishes; joins same turn) vs "queue". Only the turn's caller steers. Caller message cancels pending approval.
- NDJSON event stream, ULID ids, absolute cursors, idempotent ingest (retried step re-emits new ids).
- Open durability bugs: #535 (no resume after crash mid-step, p1), #3570 (upgrade fails parked sessions on postgres), #1981 (shutdown wedge ~14 min), #2876 (6k-event replay > 240 s), #1869 (Slack approval dropped on postgres).
- Memory provider contract: recall turn.started (+compaction.completed), capture turn.completed/compaction.requested, tools(); scope key + operationId; recalled as user-role attributed, never system. fileMemory needs backend off Vercel.
- Approval: per-tool never() default, once, always, auto() (Jev via Gateway), custom policy fn(ctx{session, toolName, toolInput, approvedTools, callId, abortSignal}) -> not-applicable|user-approval|approved|denied. approval.response policy authorises responder. Approvals are durable input.requested/input.resolved events; stale never authorises. Hooks cannot block (throw is logged).
- Spend: maxTokenCostUsdPerSession only, Gateway-reported cost, user can approve past it.
- Channels: HTTP, Slack, Discord, Teams, Telegram, Twilio (SMS + TwiML Gather speech, turn-based), GitHub, Linear, Linq, Photon, MCP, chat-sdk. Continuation addresses + aliasing for cross-channel. Custom channel contract defineChannel; constant-time signature checks; identity only from verified signature.
- Schedules: static cron as Nitro task in the web process; markdown schedules run as app principal and fail on approval-needing tools.
- Sandbox provider contract: prepare/start/resume + handle(run, spawn, files, stop, delete) — Firecracker service could implement.
- Default sandbox falls back silently to just-bash (no isolation). #3506: GitHub checkout replaces deny-all network policy with "*" broker policy (open). #3858: PR content not marked untrusted.
- CLI telemetry on by default; Vercel trace export default on Vercel.
Copy: steer/queue semantics; approvals as durable request/resolution events + responder policy; stable-id event stream; memory provider contract; sandbox provider contract; channel identity rules; session-limit continuation prompts.
Avoid: fail-open defaults; LLM classifier as gate; vendor telemetry default; cron in web process.
