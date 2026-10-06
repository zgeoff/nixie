# eve

Report: 2.1.3

eve is a durable agent framework that runs on Nitro and the `@workflow/*` protocol. nixie does not
adopt eve as its skeleton, but copies its contracts: turn steering, approvals as durable events, the
event stream, and the memory, sandbox, and channel provider contracts. eve releases fast and carries
open durability bugs, and several of its defaults fail open. The sources for these findings are in
the agent report.

## Where it runs

The findings cover `eve@0.71.2`. eve shipped 228 releases between 2026-06-09 and 2026-10-05, about
65 of them minor versions.

- eve requires Node 24 or later.
- eve runs on Nitro 3, which is in beta.
- eve takes `ai@^7` as a peer dependency.
- eve does not support Bun (issue #101).

A self-hosted eve runs as a Nitro server. Its local world lives in `.eve/.workflow-data` or in
`@workflow/world-postgres`. The `@workflow/*` protocol is at 5.0.0-beta.

## Agent loop

A step is 1 model call plus the tools it calls inline. eve replays completed steps. An interrupted
step re-runs up to 4 times, so tools need to be idempotent.

The `turnPolicy` setting decides what a new message does to a running turn:

- `"steer"` interrupts generation before output, lets a running tool finish, and joins the message
  to the same turn.
- `"queue"` holds the message for later.

Only the turn's caller can steer. A message from the caller cancels a pending approval.

## Event stream

eve emits an NDJSON event stream with ULID ids and absolute cursors. Ingest is idempotent. A retried
step re-emits events with new ids.

## Durability bugs

These durability bugs are open:

- #535: a session does not resume after a crash mid-step. Priority p1.
- #3570: an upgrade fails parked sessions on Postgres.
- #1981: shutdown wedges for about 14 minutes.
- #2876: replaying 6k events takes more than 240 s.
- #1869: a Slack approval is dropped on Postgres.

## Memory

A memory provider implements a contract of 3 parts:

- recall, on `turn.started` and on `compaction.completed`
- capture, on `turn.completed` and on `compaction.requested`
- `tools()`

Each call carries a scope key and an `operationId`. eve injects recalled memory as an attributed
user-role message, never as system. The `fileMemory` provider needs a backend when it runs off
Vercel.

## Policy and approvals

eve sets an approval policy per tool:

- `never()`, the default
- `once`
- `always`
- `auto()`, which routes to Jev through the Gateway
- a custom policy function

The custom function receives a context of `session`, `toolName`, `toolInput`, `approvedTools`,
`callId`, and `abortSignal`. It returns `not-applicable`, `user-approval`, `approved`, or `denied`.

The `approval.response` policy authorises who may respond to an approval. Approvals are durable
`input.requested` and `input.resolved` events, and a stale approval never authorises a call. Hooks
cannot block a call: eve logs a hook that throws and continues.

## Budgets

`maxTokenCostUsdPerSession` is the only spend limit. It uses the cost the Gateway reports, and the
user can approve going past it.

## Channels and triggers

eve ships these channels:

- HTTP
- Slack
- Discord
- Teams
- Telegram
- Twilio, for SMS and TwiML Gather speech, turn-based
- GitHub
- Linear
- Linq
- Photon
- MCP
- chat-sdk

Continuation addresses and aliasing carry a conversation across channels. A custom channel
implements the `defineChannel` contract. Channels check signatures in constant time, and eve takes
identity only from a verified signature.

Static cron schedules run as a Nitro task inside the web process. Markdown schedules run as the app
principal and fail on any tool that needs approval.

## Extension model

A sandbox provider implements `prepare`, `start`, and `resume`, and returns a handle with `run`,
`spawn`, `files`, `stop`, and `delete`. A Firecracker service could implement this contract.

## Security record

- The default sandbox falls back to just-bash without warning, which gives no isolation.
- Issue #3506, open: a GitHub checkout replaces the deny-all network policy with the `"*"` broker
  policy.
- Issue #3858: eve does not mark pull request content as untrusted.
- CLI telemetry is on by default.
- On Vercel, trace export to Vercel is on by default.

## What nixie copies

- steer and queue semantics
- approvals as durable request and resolution events, with a responder policy
- an event stream with stable ids
- the memory provider contract
- the sandbox provider contract
- the channel identity rules
- continuation prompts at session limits

## What nixie avoids

- defaults that fail open
- an LLM classifier as a gate
- vendor telemetry on by default
- cron inside the web process
