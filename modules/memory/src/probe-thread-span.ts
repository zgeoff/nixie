import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { MomentSpan } from './moment-types';

export async function probeThreadSpan(
  db: Kysely<unknown>,
  thread: string,
  span: MomentSpan,
): Promise<boolean> {
  if (span.firstSequence > span.lastSequence) {
    return false;
  }

  const edges = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', thread)
    .where('sequence', 'in', [span.firstSequence, span.lastSequence])
    .execute();

  return edges.length === new Set([span.firstSequence, span.lastSequence]).size;
}
