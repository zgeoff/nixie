import type { Log, LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readNoteRow } from '../note/read-note-row';
import type { NotebookMemory, NotebookTables } from '../types';
import type { ParsedTarget } from './parse-link-target';
import { readEventState } from './read-event-state';

export interface ResolvedTarget {
  readonly kind: ParsedTarget['kind'];

  // the UUID that a link stores, or the event ID
  readonly id: string;

  // what a result shows: the short ID, or the event ID
  readonly shownID: string;
}

export interface TargetScope {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly memory: NotebookMemory;

  // the thread an event link must sit on
  readonly logThread: string;
}

// A target that a new link may name: an active note, an item or a moment that is not being
// forgotten or destroyed, or an event of the caller's own thread. Null for every other case, so a
// refusal never shows whether a record on another thread exists.
export async function resolveLinkTarget(
  scope: TargetScope,
  target: ParsedTarget,
): Promise<ResolvedTarget | null> {
  const resolved = await resolveTarget(scope, target, { isLive: true });

  return resolved;
}

// A target that an unlink may name: the same kinds, in any state, so a link to a forgotten target
// can still be removed.
export function resolveUnlinkTarget(
  scope: TargetScope,
  target: ParsedTarget,
): Promise<ResolvedTarget | null> {
  return resolveTarget(scope, target, { isLive: false });
}

interface ResolveOptions {
  readonly isLive: boolean;
}

async function resolveTarget(
  scope: TargetScope,
  target: ParsedTarget,
  options: ResolveOptions,
): Promise<ResolvedTarget | null> {
  const db = scope.log.writer.db;

  if (target.kind === 'note') {
    const row = await readNoteRow(db, target.id);

    return row === null || (options.isLive && row.state !== 'active')
      ? null
      : { kind: 'note', id: row.note_id, shownID: row.short_id };
  }

  if (target.kind === 'memory') {
    return resolveItem(scope, db, target.id, options.isLive);
  }

  if (target.kind === 'moment') {
    return resolveMoment(db, target.id, options.isLive);
  }

  if (!options.isLive) {
    return { kind: 'event', id: target.id, shownID: target.id };
  }

  const state = await readEventState(scope.log, scope.logThread, Number(target.id));

  return state === 'live' ? { kind: 'event', id: target.id, shownID: target.id } : null;
}

async function resolveItem(
  scope: TargetScope,
  db: Kysely<unknown>,
  id: string,
  isLive: boolean,
): Promise<ResolvedTarget | null> {
  const mapped = await scope.memory.readItemIDMap([id]);

  const itemID = mapped.get(id);

  if (itemID === undefined) {
    return null;
  }

  const row = await db
    .$extendTables<NotebookTables>()
    .selectFrom('memory_items')
    .select('state')
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  // A retired item is a valid target, so a note can supersede it.
  if (row === undefined || (isLive && row.state !== 'active' && row.state !== 'retired')) {
    return null;
  }

  const shortIDs = await scope.memory.readShortIDs([itemID]);

  return { kind: 'memory', id: itemID, shownID: shortIDs.get(itemID) ?? itemID };
}

async function resolveMoment(
  db: Kysely<unknown>,
  id: string,
  isLive: boolean,
): Promise<ResolvedTarget | null> {
  const row = await db
    .$extendTables<NotebookTables & LogTables>()
    .selectFrom('moments')
    .select(['moment_id', 'short_id', 'state'])
    .where((eb) => eb.or([eb('short_id', '=', id), eb('moment_id', '=', id)]))
    .executeTakeFirst();

  if (row === undefined || (isLive && row.state !== 'active' && row.state !== 'retired')) {
    return null;
  }

  return { kind: 'moment', id: row.moment_id, shownID: row.short_id };
}
