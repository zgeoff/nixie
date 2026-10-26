import type { Log, LogTables } from '@heynixie/log';
import type { MomentTables, MomentTarget } from './moment-types';
import type { MomentDetail } from './read-moment-detail';
import { readMomentDetail } from './read-moment-detail';
import { readMomentRow } from './read-moment-row';

export interface MomentDestroyPreview {
  readonly momentID: string;
  readonly shortID: string;
  readonly version: number;
  readonly state: 'active' | 'retired';
  readonly thread: string;
  readonly keptBy: 'owner' | 'model';
  readonly keptAt: number;
  readonly title: string | null;
  readonly note: string | null;
  readonly reflections: MomentDetail['reflections'];

  // what the destroy shreds: every version of the title, the note and each reflection, and the links
  readonly lost: { readonly texts: number; readonly links: number };

  // the span's records, which keep their own keys
  readonly kept: { readonly records: number };
}

export type MomentDestroyPreviewRead =
  | { readonly status: 'ready'; readonly preview: MomentDestroyPreview }
  | { readonly status: 'refused'; readonly reason: 'not_found' | 'stale' };

// One transaction holds the version check, the texts and the counts, so an edit that commits
// between the reads cannot pair the old version with the new reflection.
export function readMomentDestroyPreview(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  target: MomentTarget,
): Promise<MomentDestroyPreviewRead> {
  return log.writer.db
    .transaction()
    .execute((tx) =>
      readPreviewInSnapshot(
        { deploymentKey: log.deploymentKey, writer: { ...log.writer, db: tx } },
        target,
      ),
    );
}

async function readPreviewInSnapshot(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  target: MomentTarget,
): Promise<MomentDestroyPreviewRead> {
  const db = log.writer.db.$extendTables<MomentTables & LogTables>();

  const row = await readMomentRow(db, target.momentID);

  if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
    return { status: 'refused', reason: 'not_found' };
  }

  if (row.version !== target.version) {
    return { status: 'refused', reason: 'stale' };
  }

  const [detail, texts, links, records] = await Promise.all([
    readMomentDetail(log, row),
    db
      .selectFrom('moment_texts')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('moment_id', '=', row.moment_id)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('moment_links')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('moment_id', '=', row.moment_id)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('records')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('thread', '=', row.thread)
      .where('sequence', '>=', row.first_sequence)
      .where('sequence', '<=', row.last_sequence)
      .executeTakeFirstOrThrow(),
  ]);

  return {
    status: 'ready',
    preview: {
      momentID: row.moment_id,
      shortID: row.short_id,
      version: row.version,
      state: row.state,
      thread: row.thread,
      keptBy: row.kept_by,
      keptAt: row.kept_at,
      title: detail.title,
      note: detail.note,
      reflections: detail.reflections,
      lost: { texts: texts.count, links: links.count },
      kept: { records: records.count },
    },
  };
}
