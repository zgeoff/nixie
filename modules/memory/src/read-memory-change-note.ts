import type { Log } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { z } from 'zod';
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

// Reads the memory changes since the conversation's last turn that came from outside it, such as a
// writer batch, and each outside write that merged into its proposals, and renders the next turn's
// note. A turn from before the note covered up to its own record.
export async function readMemoryChangeNote(
  log: Pick<Log, 'writer'>,
  store: Pick<MemoryStore, 'recall'>,
  cap: number,
): Promise<TurnMemoryNote> {
  const after = await readNotedThrough(log);
  const through = await readHeadSequence(log);
  const versions = await readOutsideVersions(log, { after, through });
  const caughtUp = await readCaughtUpSequence(log);
  const split = splitCatchUpVersions(versions, caughtUp);
  const changes = await readNotedChanges(store, split.listed.slice(0, cap));
  const merges = await readOutsideMerges(log, { after, through });

  return {
    text: renderMemoryChangeNote({
      changes,
      merges,
      moreCount: Math.max(split.listed.length - cap, 0),
      catchUpCount: split.catchUpCount,
    }),
    throughSequence: through,
  };
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly thread: string | null;
    readonly kind: string;
    readonly payload: string;
  };
}>;

interface NotedVersion {
  readonly item_id: string;
  readonly change: MemoryChange;
  readonly state: 'active' | 'retired';
  readonly origin: MemoryOrigin;
  readonly sequence: number;
}

const turnEnded = z.object({ memoryNotedThrough: z.int().optional() });

async function readNotedThrough(log: Pick<Log, 'writer'>): Promise<number> {
  const last = await log.writer.db
    .$extendTables<RecordTables>()
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('thread', '=', conversationTaskID)
    .where('kind', '=', 'model.turn_ended')
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (last === undefined) {
    return 0;
  }
  const payload = turnEnded.safeParse(JSON.parse(last.payload));

  return payload.success ? (payload.data.memoryNotedThrough ?? last.sequence) : last.sequence;
}

async function readHeadSequence(log: Pick<Log, 'writer'>): Promise<number> {
  const head = await log.writer.db
    .$extendTables<RecordTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('head'))
    .executeTakeFirst();

  return head?.head ?? 0;
}

interface VersionRange {
  readonly after: number;
  readonly through: number;
}

// every version in the range that the conversation did not write, oldest first
function readOutsideVersions(
  log: Pick<Log, 'writer'>,
  range: VersionRange,
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
  range: VersionRange,
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
    return [{ itemID: item.itemID, change: pickChange(version, item.state), text: item.text }];
  });
}

function pickChange(version: NotedVersion, state: 'active' | 'retired'): NotedChange['change'] {
  if (state === 'retired') {
    return 'retired';
  }
  return version.change === 'created' ? 'remembered' : 'changed';
}
