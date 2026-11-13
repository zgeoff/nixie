# nixie with no built-in memory task

- **Status:** draft
- **Work items:** [the fixtures](https://linear.app/zgeoff/issue/GEO-2551),
  [the note-taker delete](https://linear.app/zgeoff/issue/GEO-1849),
  [the consolidator delete](https://linear.app/zgeoff/issue/GEO-2114),
  [the deploy and its rollback](https://linear.app/zgeoff/issue/GEO-2556)

One release deletes nixie's 2 built-in memory tasks, the note-taker and the consolidator. A
deployment's event log still holds what they wrote, so nixie keeps parsing and folding those
records, and shows each one everywhere as nixie's own. A task of the 2 that a log still holds gets
the built `runOffTaskStep`, which empties its inbox and does nothing else. nixie ignores the 2
tasks' config sections with a warning, and a task that the agent starts does their work through the
ordinary memory tools.

Terms that the [glossary](../../glossary.md) lacks:

- **Note-taker:** the system task `memory-writer`, which saved memories from the conversation in
  batches.
- **Consolidator:** the system task `memory-consolidator`, which proposed a diff of merges and
  rewrites once a week.
- **Leftover task:** either system task, in the log of a deployment that ran a release with the
  built-in tasks.
- **Retired prompt ID:** `writer` or `consolidator`, which only stored data holds.

## Shape

```mermaid
flowchart LR
  config[config.yaml] -->|strict schema| start[server start]
  start -->|systemSteps| off[runOffTaskStep for each leftover task]
  log[(event log: 11 record kinds)] --> proj[3 projections]
  proj --> review[memory review and memory.pending]
  proj --> render[renderers: no note-taker words]
  sweep[lapse sweep] -->|memory.consolidation_lapsed| log
  manifest[nixie.yaml] -->|seed| prompts[storedPromptIDs parse, promptIDs render]
```

## Contracts

### The log fixtures and their loader

```ts
const { log } = await startTestLog();
await loadLogFixture(log, memoryTasksFixture); // a fixture read from its committed JSON file
// → resolves; a rebuild of the projections then gives the tables that the fixture script's log had
```

```ts
// log module, test-utils, beside startTestLog. The memory, prompts and definitions tests read it.
function loadLogFixture(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  fixture: LogFixture,
): Promise<void>;

interface LogFixture {
  // base64 of the raw AES-KW key that the fixture script's log wrapped every record key under.
  // startTestLog makes a new non-extractable key per log, so the loader unwraps each record key
  // with this one and wraps it again under log.deploymentKey.
  deploymentKey: string;
  keys: readonly { keyID: string; wrapped: string }[]; // base64, as the key store holds them
  records: readonly JSONObject[]; // each row of the record table as stored, sealed fields in base64
}

// The loader copies each row as stored, sequence included, into an empty test log, and writes
// each key row. It appends nothing through the writer. A later migration of the stored format
// runs over a loaded fixture as it runs over a deployment's log.

// startTestLog gains one option, so the fixture script's log has a key it can export:
function startTestLog(options?: { deploymentKey?: CryptoKey }): Promise<TestLog>; // TestLog as built
```

### The off config

```ts
// server test-utils. The tests of the delete read this one constant.
export const builtInMemoryTasksOffConfig = `
memory_writer:
  enabled: false
memory_consolidation:
  enabled: false
`;
```

### The steps of the leftover tasks

```ts
// server: the built map from a system task ID to its step
const systemSteps = new Map([
  [conversationTaskID, reader.get('conversation_imp').runStep],
  [memoryWriterTaskID, runOffTaskStep], // 'memory-writer'
  [memoryConsolidatorTaskID, runOffTaskStep], // 'memory-consolidator'
]);
```

### The prompt IDs

The note-taker delete adds `storedPromptIDs` with `writer`, and the consolidator delete moves
`consolidator` into it.

```ts
// prompts module. promptIDs feeds the manifest schema, the prompt tools and the render.
export const promptIDs = [
  'content-checker',
  'retirement-checker',
  'session',
  'compaction',
  'task',
] as const satisfies readonly PromptID[]; // PromptID loses 'writer' and 'consolidator'

// The closed enum that parses stored data: a prompts.override_proposed record, the 2 readers of a
// stored approval's prompt ID, and the stored definitions in force.
export const storedPromptIDs = [...promptIDs, 'writer', 'consolidator'] as const;
export type StoredPromptID = (typeof storedPromptIDs)[number];
```

### The status procedures

```ts
memory.writerStatus(); // isEnabled is always false; every other field reads the memory_writer projection
// → { isEnabled: false, backlog: 0, batches: 212, cursor: 40981, failures: 0,
//     isCatchingUp: false, lastError: null, retryAt: null }
memory.consolidatorStatus();
// → { isEnabled: false }

// API contract: both keep their built output schemas and gain .route({ deprecated: true }), as
// log.follow has. consolidatorStatus's built schema is { isEnabled: boolean }.
```

### The config that nixie ignores

```yaml
# config.yaml: nixie ignores each of these keys, whatever it holds, and logs a warning that names it
memory_writer: {}
memory_consolidation: {}
models:
  roles:
    memory-writer: {}
    memory-consolidator: {}
```

```yaml
# nixie.yaml: the seed ignores either key, logs a warning that names it, and keeps the rest
prompts:
  writer: {}
  consolidator: {}
```

### The origin `memory_writer`

nixie reads the stored origin `memory_writer` as `conversation` when it projects a record, so every
reader gets `conversation`: the agent's renderers, the API and host contracts, the web screens and
the export. No renderer holds a case for `memory_writer`.

## Constraints

### Who writes memory

- Only the conversation and a task write memory, through the ordinary memory tools and the write
  gate.
- nixie registers neither `memory.flag-self-note` nor `memory.consolidate`. The conversation holds
  neither `memory.diff` nor `memory.comment`, and the host has no `memory-diff` command.
- Each rewrite or retirement by a task is its own proposal or applied version. nixie never gathers
  them in one diff.

### What anyone reads

- No screen, contract, export, tool or prompt shows the note-taker, by name, by origin or by a
  sentence about it. A record it wrote reads as one the conversation wrote.
- nixie never rewrites a stored origin. A stored version or proposal keeps `memory_writer` in the
  event log, and only the parsers of stored records know the value.
- The web review drops the note-taker from every sentence, such as the one for the reason
  `sensitive`.
- No code writes a catch-up record or a self-note flag record. `buildCatchUpKind` and
  `buildSelfNoteFlagKind` stay, and render only the records of each kind that a log holds.
- Text of an item or of a message that holds "note-taker" renders as stored.

### Stored records of the 2 tasks

- nixie parses each of the 11 record kinds, and the `memory_writer` projection and the 2
  consolidation projections fold them, so a rebuild from the log gives the same tables.
- A rebuild gives the same rows of `memory_consolidation_changes` as before the delete.
- The parsers of stored versions and proposals and the table check hold the origin `memory_writer`.
  The API and host contracts and the export schema lose it, which narrows what nixie returns and
  breaks no client.
- A pending proposal with the origin `memory_writer` shows in memory review and in `memory.pending`.
  You approve or reject it, and it lapses at its stored time. It shows as a proposal of the
  conversation.
- A version that the note-taker applied shows as a version of the conversation, with what a
  conversation version shows.
- nixie never publishes a batch that a log holds as planned and not published.
- No tool, command or procedure answers a pending diff. The built lapse sweep lapses each pending
  change at its stored time, on the thread `memory-consolidator`, and applies nothing.
- A version that an approved change wrote reads as any version.
- nixie never reads a diff's sealed summary or a change's sealed text. A forget of the item destroys
  the key they are sealed under.
- This release ships before stage 1 of
  [the evidence purge](evidence-purge.md#the-2-stages-and-a-rollback), whose stage 2 scrubs each
  merge change once. This release deletes no key and writes no new record, so a rollback from it
  meets nothing new.

### The leftover tasks

- A step of a leftover task acknowledges each inbox entry and each due timer, writes no `memory.*`
  record, starts no model and never fails.
- The task directory lists neither task, so neither is a recipient of `task.message`.
- nixie never creates a leftover task on a log that has none, and never writes a record that closes
  one.

### The config and the manifest

- nixie ignores each of these keys in `config.yaml`, as it ignores every key it does not know, and
  logs a warning at start that names it. A section with any content, `enabled: false` included, has
  no effect.
- When `nixie.yaml` holds one of these keys, the seed ignores it, logs a warning that names it, and
  keeps the rest of the manifest.

### Stored prompt IDs

- A pending proposal for a retired prompt ID shows in the host's pending list. A rejection closes
  it, and it lapses at its stored time.
- An approval of a proposal for a retired prompt ID is refused with one sentence that says the
  prompt is deleted, and writes nothing.
- nixie reads an override of a retired prompt ID in the stored definitions in force, and never
  renders it.

### The status procedures

- The web client calls neither status procedure. Its session probe is `sessions.list`.
- The API serves both, because a browser tab that loaded an earlier web client probes the session
  with `memory.writerStatus`.

### A rollback

The target is the last release the deployment ran. Every shipped release from v0.41.0 holds both
`enabled` keys, each with the default `true`, and `runOffTaskStep`. A deployment on an earlier
release takes v0.41.0 or later before it takes the delete.

- After a rollback to a release with the built-in tasks, both tasks run again, because each
  `enabled` key defaults to `true`.

## Decisions

- **nixie has no built-in memory task, and a started task does the work.**
- **The 2 deletes are one release.** A deployment takes the release in one deploy, and its old
  sections only log a warning until it drops them.
- **Stored records stay, and nothing shows the note-taker.** The log keeps its records, and every
  reader sees them as the conversation's.

## Builder decides

- The sentence that refuses an approval for a retired prompt ID.
- How the fixture encodes a sealed field, and the fixture files' names.
- Internal names and the layout of the tests.

## Out of scope

- A trigger source that starts a task on each log record. The note-taking example runs on a
  schedule.
- A stub config section, a start check on the 2 tasks, and a record that closes either task.
- A rewrite of stored items, proposals or messages that hold "note-taker".
- Memory triage: no set-aside, no `memory.reword`, no `memory.propose_change`, no reword gate, and
  no triage query, record or view.
- The release that takes the 2 status procedures out of the API contract.
- The example task definitions, which the definitions work owns.

## Open questions

None.
