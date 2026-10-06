# NanoClaw / IronClaw / ZeroClaw report (2.1.2)
Pinned: N = github.com/nanocoai/nanoclaw@66f0823 (renamed from qwibitai), I = github.com/nearai/ironclaw@b0b999d (v1.4.1), Z = github.com/zeroclaw-labs/zeroclaw@e654b4b (v0.8.5).

All three: shipped defaults weaker than stated. All three shipped approval responses accepted without verifying sender/channel.

## NanoClaw
- Node host + Docker container per session (--rm, --cap-drop=ALL, no-new-privileges; no CPU/mem caps by default). Apple Container frozen branch. Central SQLite + per-session inbound.db / outbound.db.
- Host writes inbound.db; container mounts RO, polls 0.5-1 s, pushes into live SDK query via AsyncIterable (mid-turn input). Resume token in outbound.db; containers re-adopted; stuck rows retried ≤5; crash-loop breaker.
- SDK in container runs bypassPermissions by design; host guard seam ALLOW/DENY/HOLD. Package install / MCP add always admin. Outbound HTTP beyond model domains per-request approval. pending_approvals deleted on resolve; one-shot; ≤1 h deadline; every failure path denies.
- Credential gateway REQUIRED (OneCLI default or Iron Proxy): MITM injects real creds by host+path; placeholders in container; per-group gateway identity; typed contribution (env, mounts, network intent), no raw docker flags.
- NANOCLAW_EGRESS_LOCKDOWN off by default (src/config.ts#L106); --internal network fail closed when on.
- Mount allowlist outside containers, realpath, deny by default, blocks .ssh/.aws. CLAUDE.md composed on host, mounted RO. Memory markdown per group.
- No decision/tool-call log. No spending stop. Channels via skills (WhatsApp, Telegram, Discord, Slack, Signal, Matrix, iMessage, email; /add-dial SMS+voice). "Skills instead of features" = operator-applied code; 3-day min release age; build-script allowlist.
- CVEs (aggregator): CVE-2026-7875 (9.3) attachment FS boundary, fixed 1.2.0; CVE-2026-56402/56694 approval forge/bypass; CVE-2026-56693 create_agent writes central DB w/o host auth (PR #2720, 2026-06-09); symlink/path traversal; MCP add/approve missing auth. OneCLI injection bypass; command gate failed open. Press "4k lines" outdated.

## IronClaw ("Reborn" Rust rewrite)
- Single binary; self-host or agent.near.ai (TEE claim only for inference in code). Lanes: WASM wasmtime (10 MiB, 500M fuel, 60 s), Docker per (tenant,user), MCP over HTTP, first-party. libSQL default / Postgres; append-only journal.
- Process journal source of truth; run claimed under lease w/ checkpoints; expired lease requeued only at BeforeModel/BeforeBlock, else fail; side effects never auto-retried. Park at approval/auth gate, resume same run. Inputs UserMessage/FollowUp/Steering/Interrupt/Cancel/GateResolved.
- CapabilityHost -> authorization -> approvals -> resources -> dispatcher; tool manifest declares effects, default permission, network_targets. Gate order: one-shot lease -> hard floor (Financial, ModifyApproval, ModifyBudget always ask even yolo) -> per-tool ask -> global auto-approve DEFAULT ON. Approval = lease fingerprinted to exact invocation, or durable always-allow under /approvals/persistent.
- Secrets AES-256-GCM, master key in OS keychain; WASM sees secret-exists only. Egress pipeline: leak scan -> inject credential -> network policy (private IPs denied) -> redact response. Default local-dev profile = host process, DirectLogged network, LocalMinimal audit; brokered network only hosted profiles.
- AuditEnvelope w/ IDs + action/decision/result; stages Before/After/Denied/ApprovalRequested/ApprovalResolved; JSONL/libSQL/Postgres; production refuses in-memory. (No rule ID.)
- Budgets $5/day/user, $2/day/project, per-job; pause at 90%; not enforced under yolo or w/o cost table.
- Memory hybrid FTS+vector RRF (brute-force cosine); scoped tenant/user/agent/project; prompt files writable but injection-scanned.
- Extensions v3 manifest; trust classes Sandbox/UserTrusted/FirstParty/System (last two not claimable); MCP HTTP only (stdio rejected), catalog scanned; WASM pinned by SHA-256.
- Channels CLI/TUI, web, OpenAI API, Slack, Telegram, Web Push; cron/one-shot triggers scanned; no voice.
- CVEs only in deleted v1 (CVE-2026-18980 command injection; CVE-2026-16130 symlink). CHANGELOG: cross-channel approval hijack, SSRF, DNS rebinding fixes. No SECURITY.md.

## ZeroClaw
- Single Rust binary; native/Docker/Cloudflare; firmware. SQLite + JSONL cost/traces.
- One turn engine; budget check before each provider call -> BudgetExhausted ($10/day, $100/month; warn mode dead config); 20 actions/hour in memory. WS gateway steering (queue 32); interrupt_on_new_message default false. Background delegates lost after restart.
- SecurityPolicy ReadOnly/Supervised (default)/Full; allowlist includes python/node/npm; high-risk allowlisted commands still run. Approvals + always grants in memory, reset every turn. Separate approver channel fails closed.
- Secrets ChaCha20-Poly1305 w/ key file beside ciphertext; op:// refs; MCP stdio inherits daemon env.
- Sandbox auto: Landlock (only if compiled) -> Firejail -> none; neither restricts network; release builds omit Landlock/Bubblewrap.
- Audit hash chain + HMAC but log_command_event no production caller; receipts HMAC ephemeral key, off by default, verify() only in tests.
- Memory sqlite default, others; write scanning; operator list/store/delete.
- Widest channels incl. Gmail push, voice calls, wake word, full-duplex voice. Heartbeat off default.
- GHSA-93f6-34w8-5g98 / CVE-2026-101885 wasm_path arbitrary write -> RCE; v0.8.5 fixed wasmtime escape, Landlock bugs, approval-responder auth, unauthenticated webhooks.

## For nixie
Copy: typed effects + unoverridable floor (Financial, ModifyApproval, ModifyBudget); one-shot fingerprinted lease vs durable always-allow grant; AuditEnvelope stages + add rule ID; journal + checkpointed leases, no auto-retry of side effects; NanoClaw gateway seam (typed contribution, host refuses to start w/o gateway) + egress lockdown as only mode; host-side mount allowlist + RO composed instructions; BudgetExhausted before each model call; fail-closed approver channel.
Avoid: opt-in/silent-fallback security (refuse to start instead); deleted/in-memory approvals; unauthenticated approval responses (bind to owner per-channel identity); agent-originated config writes; MCP stdio inheriting env; unwired named features (test every control in production).
