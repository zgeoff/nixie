import type { ErasableFields, Log, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import { readImageRow } from './read-image-row';

export interface ImageForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

export interface ImageForgetTargets {
  // the short ID of the image
  readonly image: string;
  readonly targets: readonly ImageForgetTarget[];
}

// The records that a forget of the image takes, on whichever thread each one sits: its call and
// result, every record that names it, and the calls and results that quote its name or prompt back.
// Null when no image has the ID. Pass a log on a write transaction to read inside it.
export async function readImageForgetTargets(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  id: string,
): Promise<ImageForgetTargets | null> {
  const row = await readImageRow(log, id);

  if (row === null) {
    return null;
  }

  const db = log.writer.db.$extendTables<LogTables>();

  const result = await db
    .selectFrom('records')
    .select(['sequence', 'thread', 'parent'])
    .where('sequence', '=', row.sequence)
    .executeTakeFirst();

  const call =
    result?.parent === null || result?.parent === undefined
      ? undefined
      : await db
          .selectFrom('records')
          .select(['sequence', 'thread'])
          .where('sequence', '=', result.parent)
          .executeTakeFirst();

  const names = await db
    .selectFrom('records')
    .select(['sequence', 'thread'])
    .where('kind', '=', 'image.named')
    .where(sql`json_extract(payload, '$.image')`, '=', row.image_id)
    .execute();

  const quoting = await readQuotingRecords(log, row.image_id);

  const bySequence = new Map<number, ImageForgetTarget>();

  for (const record of [call, result, ...names, ...quoting]) {
    if (record !== undefined && record.thread !== null) {
      bySequence.set(record.sequence, { thread: record.thread, sequence: record.sequence });
    }
  }

  return {
    image: row.image_id,
    targets: [...bySequence.values()].toSorted((left, right) => left.sequence - right.sequence),
  };
}

// the tools whose results quote the name or the prompt of an image they name
const quotingTools = ['image.name', 'image.list', 'image.read'];

interface Locatable {
  readonly sequence: number;
  readonly thread: string | null;
}

async function readQuotingRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  image: string,
): Promise<Locatable[]> {
  const db = log.writer.db.$extendTables<LogTables>();

  const results = await db
    .selectFrom('records as result')
    .innerJoin('records as call', 'call.sequence', 'result.parent')
    .select([
      'result.sequence as result_sequence',
      'result.thread as result_thread',
      'call.sequence as call_sequence',
      'call.thread as call_thread',
      sql`json_extract(call.payload, '$.tool')`.as('tool'),
    ])
    .where('result.kind', '=', 'tool_result')
    .where('call.kind', '=', 'tool_called')
    .where(sql`json_extract(call.payload, '$.tool')`, 'in', quotingTools)
    .execute();

  if (results.length === 0) {
    return [];
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences: results.map((result) => result.result_sequence),
    limit: results.length,
  });

  const quoted = new Set(
    entries
      .filter((entry) => isQuoting(entry.record.erasable, image))
      .map((entry) => entry.record.sequence),
  );

  const located: Locatable[] = [];

  for (const result of results) {
    if (quoted.has(result.result_sequence)) {
      located.push({ sequence: result.result_sequence, thread: result.result_thread });

      if (result.tool === 'image.name') {
        located.push({ sequence: result.call_sequence, thread: result.call_thread });
      }
    }
  }

  return located;
}

const listedImageSchema = z.object({ image: z.string() });

const quotedResultSchema = z.object({
  result: z.object({
    image: z.string().optional(),
    images: z.array(listedImageSchema).optional(),
  }),
});

function isQuoting(erasable: ErasableFields, image: string): boolean {
  if (erasable.status !== 'readable') {
    return false;
  }

  const parsed = quotedResultSchema.safeParse(erasable.fields);

  if (!parsed.success) {
    return false;
  }

  const listed = parsed.data.result.images ?? [];

  return parsed.data.result.image === image || listed.some((entry) => entry.image === image);
}
