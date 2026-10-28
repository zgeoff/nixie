import type { Log } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import type { MomentCursor, ShownReflection } from './pick-moment-page';
import { pickMomentPage } from './pick-moment-page';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';
import { readMomentRow } from './read-moment-row';
import type { MomentSpanEntry } from './read-moment-span-page';
import { readMomentSpanPage } from './read-moment-span-page';

export interface MomentReadRequest {
  readonly momentID: string;
  readonly after: MomentCursor | null;
  readonly tokenCap: number;
}

export interface MomentRead {
  readonly row: MomentRow;
  readonly title: string | null;
  readonly isTitleCut: boolean;

  // the note comes on the first page only, so a later page repeats nothing but the title
  readonly isFirstPage: boolean;
  readonly note: string | null;
  readonly isNoteCut: boolean;
  readonly reflections: readonly ShownReflection[];
  readonly records: readonly MomentSpanEntry[];
  readonly next: MomentCursor | null;
}

export async function readMoment(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: MomentReadRequest,
): Promise<MomentRead | null> {
  const db = log.writer.db.$extendTables<MomentTables>();

  const row = await readMomentRow(db, request.momentID);

  if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
    return null;
  }

  const detail = await readMomentDetail(log, row);

  const anchor =
    request.after?.kind === 'reflection'
      ? await readReflectionAnchor(db, request.after.after)
      : null;

  const { records, ...page } = pickMomentPage({
    detail,
    after: request.after,
    anchor,
    firstSequence: row.first_sequence,
    tokenCap: request.tokenCap,
  });

  if (records.kind === 'none') {
    return { row, ...page, records: [], next: records.next };
  }

  const span = await readMomentSpanPage(log, {
    thread: row.thread,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    after: records.after,
    tokenCap: records.tokenCap,
  });

  return {
    row,
    ...page,
    records: span.entries,
    next: span.next === null ? null : { kind: 'record', after: span.next },
  };
}

async function readReflectionAnchor(
  db: Parameters<typeof readMomentRow>[0],
  reflectionID: string,
): Promise<{ readonly createdAt: number; readonly reflectionID: string } | null> {
  const anchor = await db
    .selectFrom('moment_reflections')
    .select(['created_at', 'reflection_id'])
    .where('reflection_id', '=', reflectionID)
    .executeTakeFirst();

  return anchor === undefined
    ? null
    : { createdAt: anchor.created_at, reflectionID: anchor.reflection_id };
}
