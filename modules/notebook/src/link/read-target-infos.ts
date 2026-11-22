import type { Log, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { NotebookMemory, NotebookTables, TargetKind } from '../types';
import { linkableEventKinds } from './read-event-state';

export interface TargetRef {
  readonly kind: TargetKind;

  // the UUID a link stores, or the event ID
  readonly id: string;
}

export interface TargetInfo extends TargetRef {
  // what a result shows: the short ID, or the event ID
  readonly shownID: string;

  // the target's note, item or moment was forgotten or destroyed, or its event was erased
  readonly isGone: boolean;

  // an item's or a moment's state, and a note's: the walk shows it
  readonly state: string | null;

  // an event's own facts
  readonly event: {
    readonly thread: string;
    readonly kind: RecordKind;
    readonly at: number;
  } | null;
}

interface TargetLookup {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly memory: Pick<NotebookMemory, 'readShortIDs'>;
}

export function buildTargetKey(target: TargetRef): string {
  return `${target.kind}:${target.id}`;
}

// What each target is now: its short ID, and whether it is gone. A target that no row holds is
// gone, so a link to it reads as dangling.
export async function readTargetInfos(
  lookup: TargetLookup,
  targets: readonly TargetRef[],
): Promise<ReadonlyMap<string, TargetInfo>> {
  const infos = new Map<string, TargetInfo>();

  const byKind = (kind: TargetKind) => [
    ...new Set(targets.filter((target) => target.kind === kind).map((target) => target.id)),
  ];

  for (const info of [
    ...(await readNoteInfos(lookup, byKind('note'))),
    ...(await readItemInfos(lookup, byKind('memory'))),
    ...(await readMomentInfos(lookup, byKind('moment'))),
    ...(await readEventInfos(lookup, byKind('event'))),
  ]) {
    infos.set(buildTargetKey(info), info);
  }

  for (const target of targets) {
    if (!infos.has(buildTargetKey(target))) {
      infos.set(buildTargetKey(target), {
        ...target,
        shownID: target.id,
        isGone: true,
        state: null,
        event: null,
      });
    }
  }

  return infos;
}

async function readNoteInfos(lookup: TargetLookup, ids: readonly string[]): Promise<TargetInfo[]> {
  const infos: TargetInfo[] = [];

  for (const part of chunk(ids)) {
    const rows = await lookup.log.writer.db
      .$extendTables<NotebookTables>()
      .selectFrom('notebook_notes')
      .select(['note_id', 'short_id', 'state'])
      .where('note_id', 'in', part)
      .execute();

    infos.push(
      ...rows.map((row): TargetInfo => ({
        kind: 'note',
        id: row.note_id,
        shownID: row.short_id,
        isGone: row.state !== 'active',
        state: row.state,
        event: null,
      })),
    );
  }

  return infos;
}

const chunkSize = 400;

function chunk<Value>(values: readonly Value[]): readonly (readonly Value[])[] {
  return Array.from({ length: Math.ceil(values.length / chunkSize) }, (_, index) =>
    values.slice(index * chunkSize, (index + 1) * chunkSize),
  );
}

async function readItemInfos(lookup: TargetLookup, ids: readonly string[]): Promise<TargetInfo[]> {
  const infos: TargetInfo[] = [];

  for (const part of chunk(ids)) {
    const rows = await lookup.log.writer.db
      .$extendTables<NotebookTables>()
      .selectFrom('memory_items')
      .select(['item_id', 'state'])
      .where('item_id', 'in', part)
      .execute();

    const shortIDs = await lookup.memory.readShortIDs(rows.map((row) => row.item_id));

    infos.push(
      ...rows.map((row): TargetInfo => ({
        kind: 'memory',
        id: row.item_id,
        shownID: shortIDs.get(row.item_id) ?? row.item_id,
        isGone: row.state === 'forgetting' || row.state === 'forgotten',
        state: row.state,
        event: null,
      })),
    );
  }

  return infos;
}

async function readMomentInfos(
  lookup: TargetLookup,
  ids: readonly string[],
): Promise<TargetInfo[]> {
  const infos: TargetInfo[] = [];

  for (const part of chunk(ids)) {
    const rows = await lookup.log.writer.db
      .$extendTables<NotebookTables>()
      .selectFrom('moments')
      .select(['moment_id', 'short_id', 'state'])
      .where('moment_id', 'in', part)
      .execute();

    infos.push(
      ...rows.map((row): TargetInfo => ({
        kind: 'moment',
        id: row.moment_id,
        shownID: row.short_id,
        isGone: row.state === 'destroying' || row.state === 'destroyed',
        state: row.state,
        event: null,
      })),
    );
  }

  return infos;
}

async function readEventInfos(lookup: TargetLookup, ids: readonly string[]): Promise<TargetInfo[]> {
  const infos: TargetInfo[] = [];

  for (const part of chunk(ids)) {
    const entries = await readRecords(lookup.log, {
      afterSequence: 0,
      sequences: part.map(Number),
      kinds: linkableEventKinds,
      limit: part.length,
    });

    infos.push(
      ...entries.map((entry): TargetInfo => ({
        kind: 'event',
        id: String(entry.record.sequence),
        shownID: String(entry.record.sequence),
        isGone: entry.record.erasable.status === 'shredded',
        state: null,
        event: {
          thread: entry.record.thread ?? '',
          kind: entry.record.kind,
          at: entry.record.recordedAt.getTime(),
        },
      })),
    );
  }

  return infos;
}
