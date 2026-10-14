import type { Log } from '@heynixie/log';
import type { TurnNoteRange } from '@heynixie/models';
import { readTurnNoteRange } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { NotedChange, NotedMerge } from './render-memory-change-note';
import { renderMemoryChangeNote } from './render-memory-change-note';
import type { MemoryChange, MemoryOrigin, MemoryStore, MemoryTables } from './types';
import type { WriterTables } from './writer-types';

// The note for one turn and the sequence it covers, which the turn's record keeps so the next
// turn's note starts after it.
export interface TurnMemoryNote {
  readonly text: string | null;
  readonly throughSequence: number;
}

export interface MemoryNoteOptions {
  // how many changed items the note lists before it counts the rest
  readonly cap: number;
  readonly range?: TurnNoteRange;
}

// Reads the memory changes in the range that came from outside the conversation, such as a writer
// batch, and each outside write that merged into its proposals, and renders the next turn's note.
// The range is the turn note's, read here when the caller passes none.
export async function readMemoryChangeNote(
  log: Pick<Log, 'writer'>,
  store: Pick<MemoryStore, 'recall'>,
  options: MemoryNoteOptions,
): Promise<TurnMemoryNote> {
  const noted = await readNoteRange(log, options.range);
  const cap = options.cap;
  const versions = await readOutsideVersions(log, noted);
  const caughtUp = await readCaughtUpSequence(log);
  const split = splitCatchUpVersions(versions, caughtUp);
  const changes = await readNotedChanges(store, split.listed.slice(0, cap));
  const merges = await readOutsideMerges(log, noted);

  return {
    text: renderMemoryChangeNote({
      changes,
      merges,
      moreCount: Math.max(split.listed.length - cap, 0),
      catchUpCount: split.catchUpCount,
    }),
    throughSequence: noted.through,
  };
}

function readNoteRange(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange | undefined,
): Promise<TurnNoteRange> {
  return range === undefined ? readTurnNoteRange(log) : Promise.resolve(range);
}

interface NotedVersion {
  readonly item_id: string;
  readonly change: MemoryChange;
  readonly state: 'active' | 'retired';
  readonly origin: MemoryOrigin;
  readonly sequence: number;
}

// every version in the range that the conversation did not write, oldest first
function readOutsideVersions(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<readonly NotedVersion[]> {
  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['item_id', 'change', 'state', 'origin', 'sequence'])
    .where('sequence', '>', range.after)
    .where('sequence', '<=', range.through)
    .where('origin', '!=', 'conversation')
    .orderBy('sequence')
    .execute();
}

// every merge in the range into a proposal the conversation made, from a write outside it
function readOutsideMerges(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<readonly NotedMerge[]> {
  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposal_merges')
    .innerJoin(
      'memory_proposals',
      'memory_proposals.proposal_id',
      'memory_proposal_merges.proposal_id',
    )
    .select(['memory_proposal_merges.proposal_id as proposalID', 'memory_proposal_merges.origin'])
    .where('memory_proposal_merges.sequence', '>', range.after)
    .where('memory_proposal_merges.sequence', '<=', range.through)
    .where('memory_proposals.origin', '=', 'conversation')
    .where('memory_proposals.status', '=', 'pending')
    .where('memory_proposal_merges.origin', '!=', 'conversation')
    .orderBy('memory_proposal_merges.sequence')
    .execute();
}

async function readCaughtUpSequence(log: Pick<Log, 'writer'>): Promise<number | null> {
  const writer = await log.writer.db
    .$extendTables<WriterTables>()
    .selectFrom('memory_writer')
    .select('caught_up_sequence')
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirst();

  return writer?.caught_up_sequence ?? null;
}

interface SplitVersions {
  readonly catchUpCount: number;
  readonly listed: readonly NotedVersion[];
}

// The catch-up's versions, which the writer wrote before the catch-up ended, count as one number;
// every other version lists by item.
function splitCatchUpVersions(
  versions: readonly NotedVersion[],
  caughtUp: number | null,
): SplitVersions {
  const isCatchUp = (version: NotedVersion) =>
    version.origin === 'memory_writer' && (caughtUp === null || version.sequence < caughtUp);
  const catchUp = versions.filter((version) => isCatchUp(version));

  return {
    catchUpCount: new Set(catchUp.map((version) => version.item_id)).size,
    listed: collectLatestVersions(versions.filter((version) => !isCatchUp(version))),
  };
}

// each changed item once, at its latest version, in the order it first changed
function collectLatestVersions(versions: readonly NotedVersion[]): readonly NotedVersion[] {
  const latest = new Map<string, NotedVersion>();

  for (const version of versions) {
    const first = latest.get(version.item_id);

    latest.set(version.item_id, {
      ...version,
      change: first?.change === 'created' ? 'created' : version.change,
    });
  }
  return [...latest.values()];
}

// The items' current text, through recall, which records what it delivered and leaves out an item
// that a forget has begun.
async function readNotedChanges(
  store: Pick<MemoryStore, 'recall'>,
  versions: readonly NotedVersion[],
): Promise<readonly NotedChange[]> {
  if (versions.length === 0) {
    return [];
  }
  const result = await store.recall({
    itemIDs: versions.map((version) => version.item_id),
    includeRetired: true,
    limit: versions.length,
    thread: conversationTaskID,
  });
  const texts = new Map(result.items.map((item) => [item.itemID, item]));

  return versions.flatMap((version) => {
    const item = texts.get(version.item_id);

    if (item === undefined) {
      return [];
    }
    return [{ shortID: item.shortID, change: pickChange(version, item.state), text: item.text }];
  });
}

function pickChange(version: NotedVersion, state: 'active' | 'retired'): NotedChange['change'] {
  if (state === 'retired') {
    return 'retired';
  }
  return version.change === 'created' ? 'remembered' : 'changed';
}
