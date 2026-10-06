# NanoClaw, IronClaw, and ZeroClaw

Code pinned at these commits:

- NanoClaw: github.com/nanocoai/nanoclaw at 66f0823, renamed from qwibitai
- IronClaw: github.com/nearai/ironclaw at b0b999d, version v1.4.1
- ZeroClaw: github.com/zeroclaw-labs/zeroclaw at e654b4b, version v0.8.5

NanoClaw, IronClaw, and ZeroClaw are 3 personal agent runtimes. NanoClaw runs a Node host that
starts a Docker container per session and routes every credential through a required gateway.
IronClaw is a Rust rewrite with typed tool effects, an approval lease bound to the exact invocation,
and a durable process journal. ZeroClaw is a Rust binary with the widest channel set and a spending
check before every model call. In all 3 projects, the shipped defaults are weaker than the stated
design, and all 3 shipped code that accepted approval responses without verifying the sender or the
channel.

## NanoClaw

### Where it runs

- A Node host starts a Docker container per session with `--rm`, `--cap-drop=ALL`, and
  `no-new-privileges`.
- The container has no CPU or memory caps by default.
- Apple Container support sits on a frozen branch.
- State lives in a central SQLite database plus a per-session `inbound.db` and `outbound.db`.

### Agent loop

The host writes `inbound.db`, and the container mounts it read-only and polls it every 0.5 to 1 s.
The container pushes each new message into the live SDK query through an `AsyncIterable`, so input
can arrive mid-turn. The resume token lives in `outbound.db`. After a restart, the host re-adopts
its containers. The host retries stuck rows at most 5 times, and a crash-loop breaker stops repeated
failures.

### Policy and approvals

The SDK inside the container runs with `bypassPermissions` by design. A host-side guard returns
ALLOW, DENY, or HOLD.

- Package installs and Model Context Protocol (MCP) server additions always require an admin.
- Outbound HTTP to anything beyond the model domains needs approval per request.
- The host deletes a row in `pending_approvals` once it resolves, so each approval is one-shot.
- An approval has a deadline of at most 1 hour.
- Every failure path denies.

### Credentials and egress

The credential gateway is required: OneCLI is the default, and Iron Proxy is the alternative. The
gateway acts as a man-in-the-middle (MITM) proxy and injects real credentials by host and path,
while the container holds only placeholders. Each group gets its own gateway identity. Container
configuration is a typed contribution covering env, mounts, and network intent, never raw docker
flags.

`NANOCLAW_EGRESS_LOCKDOWN` is off by default (`src/config.ts#L106`). When it is on, the `--internal`
network fails closed.

### Mounts and memory

- A mount allowlist lives outside the containers, resolves realpaths, denies by default, and blocks
  `.ssh` and `.aws`.
- The host composes `CLAUDE.md` and mounts it read-only.
- Memory is markdown, one set per group.

### Audit and spending

- NanoClaw keeps no log of decisions or tool calls.
- NanoClaw has no spending stop.

### Channels and extension model

- Channels arrive as skills: WhatsApp, Telegram, Discord, Slack, Signal, Matrix, iMessage, and
  email. `/add-dial` adds SMS and voice.
- "Skills instead of features" means code that the operator applies.
- NanoClaw enforces a 3-day minimum release age and a build-script allowlist.

### Security record

The CVE list comes from an aggregator.

- CVE-2026-7875, rated 9.3, breaks the filesystem boundary through attachments. Release 1.2.0 fixed
  it.
- CVE-2026-56402 and CVE-2026-56694 forge or bypass approvals.
- CVE-2026-56693 lets `create_agent` write the central database without host authorization (PR
  #2720, dated 2026-06-09).
- Other findings cover symlink and path traversal, and missing authorization on MCP add and approve.
- An injection bypassed OneCLI, and the command gate failed open.
- The press figure of "4k lines" is outdated.

## IronClaw

IronClaw is the "Reborn" rewrite in Rust.

### Where it runs

IronClaw ships as a single binary, either self-hosted or on agent.near.ai. The code claims a trusted
execution environment (TEE) only for inference. Tools run in one of 4 lanes:

- WebAssembly (WASM) through wasmtime, limited to 10 MiB, 500M fuel, and 60 s
- Docker, with one container per tenant and user pair
- MCP over HTTP
- first-party tools

libSQL is the default store, with Postgres as the alternative, and both hold an append-only journal.

### Agent loop and durability

The process journal is the source of truth. IronClaw claims each run under a lease and records
checkpoints. When a lease expires, IronClaw requeues the run only at the `BeforeModel` or
`BeforeBlock` checkpoint; otherwise the run fails. IronClaw never retries side effects
automatically. A run parks at an approval or auth gate and resumes as the same run.

A run accepts these inputs:

- `UserMessage`
- `FollowUp`
- `Steering`
- `Interrupt`
- `Cancel`
- `GateResolved`

### Policy and approvals

A tool call passes through a pipeline: `CapabilityHost`, then authorization, then approvals, then
resources, then the dispatcher. Each tool manifest declares its effects, its default permission, and
its `network_targets`.

The approval gate checks, in order:

1. A one-shot lease for this call.
2. A hard minimum set of effects that always ask, even under yolo: `Financial`, `ModifyApproval`,
   and `ModifyBudget`.
3. The tool's own ask setting.
4. Global auto-approve, which is on by default.

An approval is either a lease fingerprinted to the exact invocation or a durable always-allow grant
stored under `/approvals/persistent`.

### Secrets and egress

IronClaw encrypts secrets with AES-256-GCM and keeps the master key in the OS keychain. WASM tools
see only whether a secret exists.

The egress pipeline runs in 4 steps:

1. A leak scan runs over the request.
2. IronClaw injects the credential.
3. Network policy applies and denies private IPs.
4. IronClaw redacts the response.

The default local-dev profile runs as a host process with `DirectLogged` network and `LocalMinimal`
audit. Only the hosted profiles broker the network.

### Audit and budgets

Every `AuditEnvelope` holds IDs plus the action, decision, and result. Its stages are `Before`,
`After`, `Denied`, `ApprovalRequested`, and `ApprovalResolved`. Envelopes go to JSONL, libSQL, or
Postgres, and a production build refuses an in-memory sink. An envelope carries no rule ID.

Budgets are $5 per user per day and $2 per project per day, plus a per-job budget. IronClaw pauses
at 90% of a budget. Budgets go unenforced under yolo or without a cost table.

### Memory

- Search is hybrid: full-text search (FTS) and vector results merged by reciprocal rank fusion
  (RRF), with brute-force cosine similarity.
- Memory is scoped by tenant, user, agent, and project.
- Prompt files are writable but scanned for injection.

### Extension model and channels

- Extensions use the v3 manifest.
- Trust classes are `Sandbox`, `UserTrusted`, `FirstParty`, and `System`. An extension cannot claim
  `FirstParty` or `System`.
- MCP runs over HTTP only, and IronClaw rejects stdio.
- IronClaw scans the MCP catalog.
- IronClaw pins each WASM module by SHA-256.
- Channels are the command-line interface (CLI) and terminal UI (TUI), web, an OpenAI API, Slack,
  Telegram, and Web Push.
- Cron and one-shot triggers are scanned.
- IronClaw has no voice.

### Security record

- CVEs exist only in the deleted v1: CVE-2026-18980, a command injection, and CVE-2026-16130, a
  symlink flaw.
- The CHANGELOG lists fixes for cross-channel approval hijack, server-side request forgery (SSRF),
  and DNS rebinding.
- The repo has no SECURITY.md.

## ZeroClaw

### Where it runs

ZeroClaw ships as a single Rust binary that runs natively, in Docker, or on Cloudflare, plus a
firmware target. It stores state in SQLite and writes cost and traces to JSONL.

### Agent loop

ZeroClaw has one turn engine. Before each provider call, ZeroClaw checks the budget and raises
`BudgetExhausted` past $10 per day or $100 per month. The warn mode is dead config. A rate limit of
20 actions per hour lives in memory. The WebSocket gateway accepts steering with a queue of 32, and
`interrupt_on_new_message` defaults to false. Background delegates are lost after a restart.

### Policy and approvals

- `SecurityPolicy` is one of ReadOnly, Supervised (the default), or Full.
- The command allowlist includes python, node, and npm.
- High-risk commands on the allowlist still run.
- Approvals and always grants live in memory and reset every turn.
- A separate approver channel fails closed.

### Secrets and sandbox

ZeroClaw encrypts secrets with ChaCha20-Poly1305 but keeps the key file beside the ciphertext. It
supports `op://` references. MCP stdio servers inherit the daemon's environment.

The sandbox mode auto picks Landlock if it was compiled in, then Firejail, then none. Neither
Landlock nor Firejail restricts the network. Release builds omit Landlock and Bubblewrap.

### Audit

The audit log uses a hash chain with an HMAC, but no production code calls `log_command_event`.
Receipts use an HMAC with an ephemeral key, are off by default, and only tests call `verify()`.

### Memory, channels, and triggers

- Memory defaults to SQLite, with other backends available.
- ZeroClaw scans memory writes.
- The operator can list, store, and delete memories.
- ZeroClaw has the widest channel set, including Gmail push, voice calls, a wake word, and
  full-duplex voice.
- The heartbeat is off by default.

### Security record

- GHSA-93f6-34w8-5g98, also CVE-2026-101885, turns `wasm_path` into an arbitrary write and then
  remote code execution (RCE).
- v0.8.5 fixed a wasmtime escape, Landlock bugs, missing authentication on the approval responder,
  and unauthenticated webhooks.

## What nixie takes from these projects

The 3 projects differ on these attributes:

| Attribute        | NanoClaw               | IronClaw               | ZeroClaw                    |
| ---------------- | ---------------------- | ---------------------- | --------------------------- |
| Runtime          | Node host              | Rust binary            | Rust binary                 |
| Isolation        | Docker per session     | WASM or Docker         | Landlock, Firejail, or none |
| Approval storage | deleted on resolve     | lease or durable grant | in memory                   |
| Spending stop    | none                   | $5 per user per day    | $10 per day                 |
| Decision log     | none                   | AuditEnvelope          | unwired hash chain          |
| Voice            | SMS and voice by skill | none                   | full-duplex                 |

### What nixie copies

- typed effects plus an unoverridable always-ask set: `Financial`, `ModifyApproval`, and
  `ModifyBudget`
- the split between a one-shot fingerprinted lease and a durable always-allow grant
- the `AuditEnvelope` stages, with a rule ID added
- a journal with checkpointed leases and no automatic retry of side effects
- the NanoClaw credential gateway design: typed contributions, and a host that refuses to start
  without the gateway
- egress lockdown as the only mode
- a host-side mount allowlist and read-only composed instructions
- a `BudgetExhausted` check before each model call
- an approver channel that fails closed

### What nixie avoids

- opt-in security, or security that silently falls back; nixie refuses to start instead
- approvals that are deleted or held only in memory
- unauthenticated approval responses; nixie binds each response to the owner's identity on that
  channel
- config writes that originate from the agent
- MCP stdio servers that inherit the environment
- named features that are never wired up; nixie tests every control in production
