import type { Log } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import type { MomentDetail } from './read-moment-detail';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';
import { readMomentRow } from './read-moment-row';
import type { MomentSpanPage } from './read-moment-span-page';
import { readMomentSpanPage } from './read-moment-span-page';

export interface MomentReadRequest {
  readonly momentID: string;
  readonly after: number | null;
  readonly tokenCap: number;
}

export interface MomentRead {
  readonly row: MomentRow;
  readonly detail: MomentDetail;
  readonly page: MomentSpanPage;
}

export async function readMoment(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: MomentReadRequest,
): Promise<MomentRead | null> {
  const row = await readMomentRow(log.writer.db.$extendTables<MomentTables>(), request.momentID);

  if (row === null || (row.state !== 'active' && row.state !== 'retired')) {
    return null;
  }

  const detail = await readMomentDetail(log, row);

  const page = await readMomentSpanPage(log, {
    thread: row.thread,
    firstSequence: row.first_sequence,
    lastSequence: row.last_sequence,
    after: request.after,
    tokenCap: request.tokenCap,
  });

  return { row, detail, page };
}
