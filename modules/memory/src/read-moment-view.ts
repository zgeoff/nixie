import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { momentEditedCodec } from './moment-edited-codec';
import { momentKeptCodec } from './moment-kept-codec';
import type { MomentTables } from './moment-types';
import type { MomentDetail } from './read-moment-detail';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';
import { readMomentRow } from './read-moment-row';

export interface MomentView {
  readonly row: MomentRow;
  readonly title: string | null;
  readonly titleBy: 'owner' | 'model';
  readonly note: { readonly text: string; readonly writtenAt: number } | null;
  readonly reflections: MomentDetail['reflections'];
  readonly linkedItemIDs: readonly string[];
}

// One transaction holds every read, so an edit that commits between them cannot pair one version's
// row with another version's text.
export function readMomentView(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  momentID: string,
): Promise<MomentView | null> {
  return log.writer.db
    .transaction()
    .execute((tx) =>
      readViewInSnapshot(
        { deploymentKey: log.deploymentKey, writer: { ...log.writer, db: tx } },
        momentID,
      ),
    );
}

async function readViewInSnapshot(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  momentID: string,
): Promise<MomentView | null> {
  const db = log.writer.db.$extendTables<MomentTables>();

  const row = await readMomentRow(db, momentID);

  if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
    return null;
  }

  const [detail, titleRecord, noteRecord, links] = await Promise.all([
    readMomentDetail(log, row),
    readRecordAt(log, row.title_sequence),
    row.note_sequence === null ? null : readRecordAt(log, row.note_sequence),
    db
      .selectFrom('moment_links')
      .select('item_id')
      .where('moment_id', '=', row.moment_id)
      .orderBy('linked_sequence')
      .execute(),
  ]);

  return {
    row,
    title: detail.title,
    titleBy: pickTitleWriter(titleRecord),
    note:
      detail.note === null || noteRecord === null
        ? null
        : { text: detail.note, writtenAt: noteRecord.recordedAt.getTime() },
    reflections: detail.reflections,
    linkedItemIDs: links.map((link) => link.item_id),
  };
}

async function readRecordAt(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
): Promise<LogRecord | null> {
  const [entry] = await readRecords(log, {
    afterSequence: sequence - 1,
    beforeSequence: sequence + 1,
    limit: 1,
  });

  return entry?.record ?? null;
}

function pickTitleWriter(record: LogRecord | null): 'owner' | 'model' {
  invariant(record, 'the projection names a title record the log lacks');

  return record.kind === 'moment_edited'
    ? momentEditedCodec.decode(record.payload).editedBy
    : momentKeptCodec.decode(record.payload).keptBy;
}
