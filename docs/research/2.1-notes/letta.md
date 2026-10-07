# Letta

Letta Code is an Apache-2.0 TypeScript harness that runs a persistent agent through a CLI, a desktop
app, an App Server, chat channels, and cron. Its memory system, MemFS, keeps each agent's memory as
a git repository of markdown files, and a reflection subagent consolidates that memory on a branch
before merging it back. The older Python Letta V1 server is retired and receives no security fixes,
and most of the Letta security record belongs to that server. The research read letta-code at HEAD
as of 2026-10-05 and the archive branch of the letta repository as of 2026-08-13.

## Where it runs

The Python Letta V1 server is retired and unsupported, and it gets no security fixes, according to
SECURITY.md in the letta repository. The active product is Letta Code, an Apache-2.0 TypeScript
harness with a CLI, a desktop app, an App Server, channels, and cron.

Letta Cloud is the default backend. A local backend exists behind
`LETTA_LOCAL_BACKEND_EXPERIMENTAL=1` and stores plain files under `~/.letta/lc-local-backend`, with
non-atomic writes. Letta Code calls models in-process through `@earendil-works/pi-ai`. Telemetry is
on by default, and `LETTA_CODE_TELEM=0` or `DO_NOT_TRACK` turns it off.

## Agent loop

The turn stream pauses at each tool call. The pause emits an `approval_request_message`, and
`requires_approval` marks a continuation boundary. Each conversation has one queue, which holds
messages, task notifications, approvals, and `cron_prompt` entries. Letta Code appends owner input
at the approval boundary, alongside the tool results.

Letta Code records checkpoints at `run_observed`, `before_tool_execution`, and
`after_tool_execution`. On restart, the harness replays the recorded results. A pending call with no
recorded result gets a synthetic denial and never runs again, so each tool call executes at most
once.

## Memory

MemFS, which Letta calls "Context Repositories" and shipped in February 2026, keeps a git repository
of markdown files for each agent. The layout works as follows:

- A root `MEMORY.md` holds the index.
- Each root `.md` file is core memory, which Letta Code compiles into the system prompt; its
  frontmatter holds a name and a description.
- A subdirectory with its own `MEMORY.md` is deferred memory, and only its tree and descriptions
  reach the context.
- `skills/` holds skills, and `ARCHIVE.md` holds archived memory.

MemFS builds no vector index by default. Every memory write is a git commit, with the agent as
author. A pre-commit hook enforces `.memfs.config.json`, which sets `maxFileCharacters`,
`maxCoreMemoryCharacters`, per-glob limits, `maxDepth`, and `readOnlyFiles`.

The README claims an owner can mirror the memory repository to their own git remote. The MemFS docs
at docs.letta.com/letta-code/memfs do not confirm that claim, so it is unverified.

The owner works on memory through `/remember`, `/init`, and the App Server operations
`read/write/delete_memory_file`, `memory_history`, `memory_file_at_ref`, and `memory_commit_diff`. A
cross-agent guard and bwrap or seatbelt sandboxing confine the memory subagents.

### Dreaming

Dreaming is the memory consolidation pass, and its trigger is configurable: off, every N steps, on
compaction, or manual. A reflection subagent runs the pass in 5 stages: Investigate, Extract,
Update, Review, and Commit. Under the reflection rubric, the subagent must:

- drop ephemeral facts
- write absolute dates
- fix contradictions at their source
- delete a memory, rather than archive it, when the owner asks to forget it

Each reflection commit carries the trailers `Reviewed transcript`, `Agent-ID`, and
`Parent-Agent-ID`. The reflection runs on a git worktree branch and merges back with
`merge --no-edit`. On a conflict, the subagent aborts the merge and repairs the result. The explicit
merge mode means review by the agent, not by the owner.

### The retired server

The old server kept memory blocks in Postgres and archival memory in pgvector. Its `block_history`
table had no use outside tests. Letta Code v0.32.2 removed the Agent File (`.af`) format.

## Policy and approvals

The default permission mode is unrestricted: every tool runs unless a rule denies it. Rules follow
the Claude Code style in settings, and the policy check runs in-process.

Letta Code applies bwrap or seatbelt filesystem sandboxing only when `LETTA_FS_SANDBOX=1` is set.
Network isolation is absent, since the sandbox never passes `--unshare-net`. A WebFetch domain rule
may match any URL; the research inferred this and did not confirm it.

An "always allow" answer becomes a settings rule. One-off decisions live only in the transcript, and
Letta Code keeps no decision log. The only run limit is `--max-turns`, and no spend cap exists.

## Channels and triggers

Letta Code connects to Telegram, Slack, and Discord, the source tree holds Signal and WhatsApp
adapters, and custom adapters are supported. Access starts from an allowlist, moves to pairing codes
that expire after 15 minutes, and then grants access per scope. Group chats are open by default.

Cron jobs live in `crons.json`, which Letta Code writes atomically under a lock and lease. The
scheduler ticks every 60 s and records missed runs. The Wake tool lets the agent schedule itself, at
most hourly.

Voice memos work inbound only, transcribed with gpt-4o-transcribe. LettaBot was archived on
2026-05-26.

## Extension model

Mods run in-process without a sandbox. Skills install from GitHub, ClawHub, and the Hermes hub.
Letta Code supports client-side MCP only, since server-side MCP was removed in March 2026.

The model sees secret names only. Letta Code substitutes the value for `$NAME` at execution time and
scrubs secret values from the output, though it does not scrub short values.

## Security record

The CVEs below belong to the retired server, except the LettaBot entry:

- CVE-2025-51482: remote code execution through `/v1/tools/run`
- CVE-2025-6101, with an incomplete fix tracked as CVE-2026-4965
- CVE-2026-4964: server-side request forgery (SSRF)
- CVE-2024-39025
- CVE-2026-18990: an authentication bypass in LettaBot

Memory poisoning research includes InjecMEM, MemoryGraft, and MemGhost. A Hacker News discussion
covers the same risk as "context poisoning".

## Worth borrowing

- Memory as a git repository of markdown files with frontmatter, mirrored to a remote the owner
  controls.
- The split between core and deferred memory by directory, with an index.
- Memory constraints enforced by a pre-commit hook.
- Consolidation on a branch, with the merge gated by owner review or owner policy rather than by the
  agent.
- The reflection rubric.
- Checkpoints at the tool boundary, and a rule never to re-execute an unrecorded call; nixie adds
  idempotency keys to that rule.

## Worth avoiding

- An unrestricted default permission mode.
- No egress isolation.
- Decisions recorded only in the transcript.
- No spend stop.
- Mods that run without a sandbox.
- A state format the vendor defines.
- Core memory the agent writes without a gate.
