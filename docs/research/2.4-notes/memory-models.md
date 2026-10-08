# Memory models

Report: 2.4

Sources were fetched on 2026-10-08 unless a different date is given with the source. Versions come
from the npm registry, PyPI or the GitHub releases API unless another source is named.

No memory product reviews writes through the owner by default, and none stores provenance that the
model cannot write except OpenClaw. Hermes stages writes for owner approval, but only when the owner
turns it on. Graph and vector stores claim the best retrieval scores, but every headline score is
self-reported on benchmarks that fit in one context window, and grep or BM25, a keyword ranking
function, matches or beats vector search on conversational recall. Memory poisoning succeeds against
every shipped agent tested, and prompt-injection filters miss a third or more of attacks, so a write
gate and provenance carry the defence. The fit for nixie is markdown in a git repo on the owner's
host, with every write a nixie tool call that the policy decision point gates, a derived search
index, and memory behind an interface so the backend can change.

## What nixie needs from memory

[Tier 1](../../brainstorm/1.4-requirements.md#tier-1) asks for long-term memory that the owner can
read, edit and export, and [tier 2](../../brainstorm/1.4-requirements.md#tier-2) asks for review of
writes and upkeep that merges, settles contradictions and prunes. The decisions add 4 constraints:

- A memory write is an outside action in the sense of
  [decision 0002](../../decisions/0002-approvals.md): it runs through a nixie tool, and when it
  needs approval it becomes a proposal.
- Under [decision 0005](../../decisions/0005-effects-and-taint.md) the tool declares a memory-write
  effect, and a tainted main thread is the case that most needs a gate. The 2.1 landscape treats a
  memory write as a privileged action
  ([landscape](../2.1-landscape.md#recurring-architecture-models)).
- Under [decision 0001](../../decisions/0001-durable-layer.md) nixie's event log stays the only log
  of record, so a search index must be derived and rebuildable, never a second source of truth.
- Memory sits behind an interface, so tier 1 can ship a crude backend.

## Models compared

| Model                  | Examples                       | Owner reads and edits   | Review of writes    | Provenance outside the model | Licence         |
| ---------------------- | ------------------------------ | ----------------------- | ------------------- | ---------------------------- | --------------- |
| Markdown in git        | Letta MemFS, OpenClaw, Hermes  | Any editor; git history | Hermes only, opt-in | OpenClaw's index             | Apache-2.0, MIT |
| Versioned file store   | Managed Agents memory stores   | API and file tools      | None built in       | Version records the session  | Hosted          |
| Rows in a database     | Mem0 OSS, retired Letta server | SQL or nixie's UI       | None                | Audit table only             | Apache-2.0      |
| Knowledge graph        | Graphiti, Cognee               | Cypher, not files       | None                | Edge lists its episodes      | Apache-2.0      |
| Vector or hybrid index | LanceDB, pgvector, sqlite-vec  | Not readable alone      | None                | None                         | Apache-2.0, MIT |
| Virtual file system    | OpenViking                     | `ls`, `read`, markdown  | None found          | None found                   | AGPL-3.0        |

The vector stores are indexes rather than memory models: each needs a source of truth beside it.

### Markdown in git

[Letta's notes](../2.1-notes/letta.md#memory) and
[OpenClaw's notes](../2.1-notes/openclaw.md#memory) describe each layout. The findings that matter
here:

- **Letta Code** 0.34.4, of 2026-10-04, commits every memory edit, with the agent as author. The
  claim that 2.1 left open is settled: `/memory-repository set <url>` installs a post-commit hook
  that mirrors every commit on `main` to the owner's remote, with the owner's own SSH keys. The docs
  pages do not mention the command; its source does
  ([`memory-repository.ts`](https://github.com/letta-ai/letta-code/blob/main/src/cli/commands/memory-repository.ts)).
  The owner never reviews a write; at most a second background conversation, run by the model,
  revises proposed updates ([memory docs](https://docs.letta.com/letta-code/memory)).
- **OpenClaw** 2026.9.8, of 2026-10-03, searches with vector and BM25 in parallel, a 30-day recency
  half-life and maximal marginal relevance (MMR) for diversity
  ([memory search](https://docs.openclaw.ai/concepts/memory-search)). Classification code writes
  chunk provenance at index time, and its dreaming pass drops candidates whose provenance is
  `untrusted` or `system` before promotion to `MEMORY.md`
  ([provenance](https://docs.openclaw.ai/concepts/memory-provenance);
  [dreaming](https://docs.openclaw.ai/concepts/dreaming)). The docs admit a gap: "Handwritten notes,
  direct agent edits, and entries staged before lineage tracking may lack entry origins." The
  agent's direct writes reach memory without an owner gate.
- **Hermes Agent** v0.21.5, of 2026-09-24, stages writes for `/memory approve` or `/memory reject`
  when `memory.write_approval` is on, and it is off by default. A staged replace or remove binds to
  the entry it targets and fails if that entry changed after staging. Hermes scans entries for
  injection, exfiltration, SSH backdoors and invisible Unicode
  ([memory docs](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md)).
  Hermes is Python, under MIT.
- **Anthropic's memory tool** `memory_20250818` gives the model file commands under `/memories`, and
  the caller's handler stores the files, so versioning and review are the caller's to build. The
  TypeScript SDK ships `BetaLocalFilesystemMemoryTool`
  ([memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)).
- **Claude Code** keeps auto memory as a `MEMORY.md` index plus topic files with a `type` in
  frontmatter, and loads the first 200 lines or 25 KB of the index each session
  ([Claude Code memory](https://code.claude.com/docs/en/memory)).

Smaller projects take the same shape: basic-memory v0.23.2 serves markdown over MCP under AGPL-3.0
([basic-memory](https://github.com/basicmachines-co/basic-memory)).

### Managed Agents memory stores

Managed Agents, under beta header `agent-memory-2026-07-22`, mounts a store at `/mnt/memory/<slug>/`
and creates an immutable `memver_` version, attributed to the session, on every change. Versions
last 30 days unless exported, an update can require a `content_sha256` match, and a store holds at
most 10,000 memories of 100 kB each. The docs suggest building "review workflows" on the API, and
warn that a prompt injection "could write malicious content into the store"
([memory stores](https://platform.claude.com/docs/en/managed-agents/memory)). Its Dreams preview
writes consolidation into a new store: "The input store is never modified, so you can review the
output and discard it" ([dreams](https://platform.claude.com/docs/en/managed-agents/dreams)). The
data stays at Anthropic, which breaks "Owner data stays home", but the version and review design is
worth copying.

### Rows in a database

Mem0 is Apache-2.0; Python `mem0ai` 2.2.1 and npm `mem0ai` 3.3.1 shipped on 2026-09-25. Its
2026-04-16 redesign made extraction add-only: the model no longer issues UPDATE or DELETE, a hash
removes exact duplicates, retrieval fuses semantic search, BM25 and entity matching, and graph
memory is gone ([v2.0.0](https://github.com/mem0ai/mem0/releases/tag/v2.0.0);
[ts-v3.0.0](https://github.com/mem0ai/mem0/releases/tag/ts-v3.0.0)). The TypeScript edition runs
in-process and logs every change to a SQLite `memory_history` table through better-sqlite3, whose
Bun support is unverified
([oss storage](https://github.com/mem0ai/mem0/tree/main/mem0-ts/src/oss/src/storage)). That table is
an audit log, not a review gate.

Rows in nixie's own database are the one model where a memory write commits in the same transaction
as the proposal and approval records. The owner then reads and edits memory only through nixie's UI
or SQL, and export becomes a job nixie writes.

### Knowledge graphs

Graphiti v0.30.2 is Apache-2.0 and Python only, on Neo4j, FalkorDB or Neptune; its Kuzu backend is
deprecated because Kuzu is unmaintained ([Graphiti](https://github.com/getzep/graphiti)). Each fact
edge holds `valid_at` and `invalid_at` plus `created_at` and `expired_at`, the model invalidates a
contradicted edge instead of deleting it, and each edge lists the episodes that stated or
invalidated it ([temporal model](https://mintlify.com/getzep/graphiti/concepts/temporal-model)). Zep
Community Edition sits in `legacy/` as unsupported, so TypeScript means Zep Cloud
([zep repo](https://github.com/getzep/zep)).

Cognee v1.6.3 is Apache-2.0, with SQLite, LanceDB and a Kuzu fork by default, and its TypeScript
package `@cognee/cognee-ts` 0.2.0 binds a Rust engine whose Bun support is unverified. Its Postgres
graph store is a demo, with the production version under a commercial licence
([Cognee](https://github.com/topoteretes/cognee);
[TypeScript docs](https://docs.cognee.ai/typescript/getting-started)).

The bi-temporal edge is the strongest idea here for settling contradictions. The owner cannot open a
graph in an editor, and every write passes through a model's extraction.

### Vector and hybrid indexes

| Index       | Version, date      | Licence       | Bun                                            | Note                                                                             |
| ----------- | ------------------ | ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| pgvector    | 0.8.7, 2026-10-01  | PostgreSQL    | Through Postgres                               | 0.8.3 and 0.8.4 fixed HNSW (hierarchical navigable small world) index corruption |
| sqlite-vec  | 0.1.9, 2026-03-31  | MIT or Apache | `loadExtension()`; macOS needs a custom SQLite | No commit since 2026-05-18                                                       |
| LanceDB     | 0.40.0, 2026-10-07 | Apache-2.0    | Unverified native addon                        | Columnar files on disk                                                           |
| SQLite FTS5 | Built into SQLite  | Public domain | `bun:sqlite`                                   | BM25 ranking                                                                     |
| ParadeDB    | 0.26.0, 2026-10-03 | AGPL-3.0      | Through Postgres                               | BM25 inside Postgres                                                             |

Sources: [pgvector changelog](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md),
[sqlite-vec](https://github.com/asg017/sqlite-vec),
[LanceDB on npm](https://www.npmjs.com/package/@lancedb/lancedb),
[bun:sqlite](https://bun.com/docs/runtime/sqlite).

FTS5 is SQLite's full-text search module. Postgres's own `ts_rank` is not BM25. Each index rebuilds
from the markdown, which keeps it out of the record that 0001 protects.

### Newer entrants

- **OpenViking** v0.4.23, of 2026-10-02, presents memory as a `viking://` file system that agents
  and owners browse with `ls`, `tree`, `read` and `grep`, and extracts memories "as Markdown you can
  inspect, edit, and merge". It has a TypeScript client over an HTTP server, under AGPL-3.0
  ([OpenViking](https://github.com/volcengine/OpenViking)).
- **Honcho** server v3.2.2 is AGPL-3.0 on Postgres, pgvector and Redis, and its "dream" pass
  consolidates what it derives per person
  ([benchmarks](https://plasticlabs.ai/blog/research/Benchmarking-Honcho)).
- **MemOS** v2.0.34 is Apache-2.0; its npm plugin `@memtensor/memos-local-plugin` keeps memory in
  one SQLite file with FTS5 and vector search, plus a viewer
  ([MemOS](https://github.com/MemTensor/MemOS)).
- **Supermemory**'s self-hosted server is a closed binary, which fails owner control
  ([self-hosting](https://supermemory.ai/docs/self-hosting/local-vs-enterprise)).
- **Agent Zero Memory**, a paper of 2026-08-30, gives every item an origin, a timestamp and a
  pointer to its evidence, and lets an answer cite only evidence the reader opened
  ([arXiv 2608.29606](https://arxiv.org/abs/2608.29606)).

## Retrieval evidence

The published scores do not separate the products:

- Graphiti claims LoCoMo 94.7% and LongMemEval 90.2%, Mem0 claims 92.5 and 94.4, MemOS 88.83 and
  89.20, and Honcho 89.9% and 90.4%, each measured by its vendor with its own reader and judge
  ([Zep research](https://www.getzep.com/research/); [Mem0 research](https://mem0.ai/research)).
- Zep showed that Mem0's comparison misconfigured Zep, and Zep's own first figure needed a
  correction
  ([Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)).
- An audit found 99 of LoCoMo's 1,540 answers wrong, which caps a correct system near 93.6%, and the
  LLM judge accepted up to 63% of deliberately wrong answers
  ([Penfield Labs](https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg)).
  Scores above that cap are suspect.

Plain retrieval holds up in independent work. On a 116-question LongMemEval subset, grep scored 83.6
to 93.1% against 62.9 to 83.6% for vector retrieval, and the same model moved about 16 points
between harnesses; the authors limit the claim to conversational recall
([Sen et al., arXiv 2605.15184](https://arxiv.org/abs/2605.15184)). Fusing BM25 with dense retrieval
added 8.8 to 17.2 Hit@1 points on LoCoMo and nothing on LongMemEval-S, dense retrieval won on
multi-hop and temporal questions, and cross-encoder reranking cost 6.9 points
([Lysenstøen, arXiv 2606.04194](https://arxiv.org/abs/2606.04194)). Letta's agent with the history
in a file scored 74.0% on LoCoMo, though its tools included semantic search
([Letta benchmark](https://www.letta.com/blog/benchmarking-ai-agent-memory)). Anthropic advises
putting a knowledge base under 200k tokens straight into the prompt with caching
([Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)).

Retrieval quality therefore depends more on the harness and the model than on the store, and none of
these benchmarks tests a personal assistant's memory after months of use.

## Memory poisoning

Every shipped agent tested is open to poisoning through memory:

| Attack             | Paper, date                  | Result                                                                |
| ------------------ | ---------------------------- | --------------------------------------------------------------------- |
| MPBench, 6 classes | Dash et al., 2026-06-03      | 34.25% on OpenClaw, 66.67% on Hermes, 85.17% for compaction poisoning |
| MemGhost           | arXiv 2607.05189, 2026-07-06 | 1 email: 87.5% on OpenClaw, 71.4% on a Claude Agent SDK agent         |
| MAFIA              | arXiv 2608.03844, 2026-08-04 | 90.7% against agents that audit memory; detection fell to 7.4%        |
| FARMA              | arXiv 2607.05029, 2026-07-06 | Up to 100% with forged reasoning traces; beats A-MemGuard             |
| InjecMEM           | arXiv 2608.23471, 2026-08-24 | 1 interaction plants a record that steers later queries               |
| AgentPoison        | arXiv 2407.12784, 2024       | Over 80% with under 0.1% of the store poisoned                        |

Sources: [Dash et al.](https://arxiv.org/abs/2606.04329),
[MemGhost](https://arxiv.org/abs/2607.05189), [MAFIA](https://arxiv.org/abs/2608.03844),
[FARMA](https://arxiv.org/abs/2607.05029), [InjecMEM](https://arxiv.org/abs/2608.23471),
[AgentPoison](https://arxiv.org/abs/2407.12784).

Dash et al. name 4 routes into memory: an explicit instruction, a system-prompt policy, compaction,
and turning experience into a skill. The best of 4 prompt-injection filters, PromptArmor, caught
67.67% of attacks at a 1% false-positive rate, and the paper concludes that "existing prompt
injection defenses fail to cover memory poisoning". It recommends write policies, keeping untrusted
sources out of write decisions, provenance, and monitoring after writes. Classifiers that score
entries one at a time keep losing to newer attacks: MAFIA beat memory audits, and FARMA beat
A-MemGuard ([arXiv 2510.02373](https://arxiv.org/abs/2510.02373)). FARMA's own SENTINEL defence
scored 0% attack success with no false positives on 326 benign traces, a result no one else has
reproduced.

nixie's taint rule from 0005 maps onto these findings: a write from a tainted main thread is the
MemGhost route, and compaction is a write route that needs the same gate as any other.

## A write pipeline for nixie

The pieces above combine into one pipeline:

1. The model calls a memory tool, such as `remember` or `forget`, which declares a memory-write
   effect.
2. nixie sets the write's provenance from the turn, never from the model's arguments: owner, agent,
   untrusted or system, as OpenClaw labels origins, plus the task ID and whether the main thread was
   tainted.
3. The policy decision point decides. A rule can let an owner-origin write from a clean thread apply
   at once, as a direct request under 0005. Every other write becomes a proposal, and the
   [digest approval](../../decisions/0006-approval-record.md#digest-approvals) sheet collects them,
   so review does not cost a prompt per write.
4. On approval, nixie applies the write as its own step: a git commit whose trailers hold the
   proposal ID, the origin and the definition snapshot from
   [the versioning notes](definition-versioning.md). The step checks for a commit with that proposal
   ID before writing, so a crash between approval and commit repeats nothing. A staged edit binds to
   the blob it changes, as Hermes binds a staged replace, and fails if the owner edited the file in
   between.
5. nixie rebuilds the affected part of the search index from the commit.

The owner edits memory directly in an editor and pushes; nixie records the commit as owner-origin
and reindexes. Consolidation runs as a task on a branch, drops untrusted candidates as OpenClaw's
dreaming does, follows Letta's reflection rubric, and reaches `main` only as one proposal whose diff
the owner reviews, as Managed Agents' Dreams leave the input untouched.

The pipeline's weak point is the gap between the database and git. The approval commits in the
database, and the git commit follows as a separate step, so the 2 can disagree for a moment after a
crash. Rows in the database close that gap and give up the editor and plain-file export.

## Worth borrowing

- Letta's markdown layout with an index, core and deferred files, its pre-commit limits, its
  reflection rubric, and its mirror to an owner's remote through a post-commit hook.
- OpenClaw's provenance written by classification code, and its rule that consolidation drops
  untrusted and system candidates.
- Hermes's staged writes bound to the entry they target, and its scan for invisible Unicode.
- Managed Agents' immutable version per write, the `content_sha256` check on update, and Dreams
  output written to a new store for review.
- Graphiti's bi-temporal fact edges, which invalidate a fact instead of deleting it.
- Mem0's add-only extraction, with a hash to drop exact duplicates.
- BM25 or grep first, with vector search added where a measurement shows a gain.
- Agent Zero's evidence pointer on every item.

## Worth avoiding

- Writes that the agent commits with no owner gate, as Letta and OpenClaw do by default.
- Staging that is off by default, as in Hermes.
- A memory store held only at a vendor, such as Managed Agents memory or Supermemory's closed
  server.
- A graph or vector store as the source of truth, which the owner cannot open in an editor.
- Prompt-injection classifiers as the main defence for memory.
- Vendor benchmark scores as a reason to choose a backend.
- AGPL-3.0 dependencies, such as OpenViking, Honcho and ParadeDB, unless the owner accepts the
  licence.

## Recommendations

The research recommends the following, for the owner to decide:

1. **Markdown files in a git repo on the owner's host as the store of record.** The owner reads,
   edits, diffs and exports memory with ordinary tools, and git gives a version per write. The
   trade-off is the gap between git and the event log's transaction, which the step's idempotency
   check covers but does not remove. Rows in the event log's database are the alternative that
   closes the gap and costs the editor.
2. **Every memory write as a nixie tool with a memory-write effect.** Rules decide which writes
   apply at once; everything else becomes a proposal in the digest sheet. The trade-off is review
   load, which grows with how much the model remembers.
3. **Provenance from nixie, never from the model.** The origin, task, taint flag and proposal ID go
   in commit trailers and in the index. Writes from a tainted thread, and consolidation candidates
   of untrusted origin, always need the owner. The cost is a review of every memory the model forms
   from outside content, which is the MemGhost route.
4. **Consolidation as a proposal.** It runs on a branch and merges only on owner approval, with the
   diff in front of the owner. The cost is that unreviewed consolidation waits instead of applying.
5. **A derived index, starting with full-text search.** BM25 through SQLite FTS5 or Postgres covers
   tier 1; embeddings through pgvector or sqlite-vec follow if measurement on nixie's own memory
   shows a gain. nixie can drop and rebuild the index at any time.
6. **A memory interface with small verbs**, such as recall, propose write, apply, history and
   export, so a graph or vector backend can replace the crude one later.

## Open questions

- Which writes, if any, apply without review? An owner-origin "remember that" from a clean thread is
  the candidate under 0005; anything the model infers is not.
- How large can core memory grow before the prompt pays for it? Hermes caps `MEMORY.md` at 2,200
  characters, and Claude Code loads 25 KB.
- Does a record that recalled memory stamp the blob hash of each file it read, so replay sees what
  the model saw?
- How does nixie forget? A git rewrite, an encrypted file whose key nixie deletes, or a tombstone,
  each weighed in [the data notes](data-and-storage.md#deletion-and-the-append-only-log).

### Spikes that would settle these

- **A memory write as a proposal** (about 1 day): a `remember` tool on the host placement from
  [decision 0003](../../decisions/0003-sdk-placement.md), a proposal in the event log, approval, and
  a commit with trailers, with a crash between approval and commit. It tests the idempotency check
  and the stale-blob check.
- **Retrieval on nixie-shaped memory** (about 1 day): grep, FTS5 BM25, and FTS5 with sqlite-vec over
  a few hundred markdown files, with questions the owner writes. It tests whether embeddings earn
  their place at personal scale.
- **A poisoning run** (about half a day): replay MemGhost-style emails through a tainted worker, and
  confirm that every resulting write reaches the owner as a proposal with untrusted provenance.
