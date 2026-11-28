import type { LogTables } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readPurgeSet } from '../record/read-purge-set';
import type { MemoryContext, MemoryTables } from '../types';
import { writeRecordPurgeSet } from './write-record-purge-set';

export interface ThreadPurge {
  readonly recordSequence: number;
  readonly itemIDs: readonly string[];
}

const chunkSize = 500;

// Fixes the purge set of every record on the thread that a memory item quotes, in the transaction
// that writes the erasure's start, and answers each set. A reset of the thread removes no record,
// so each quote must go with the keys. Call it while the evidence still reads.
export async function writeThreadPurgeSets(
  tx: Transaction<unknown>,
  context: Pick<MemoryContext, 'log' | 'definitions'>,
  thread: string,
): Promise<readonly ThreadPurge[]> {
  const quoted = await readQuotedSequences(tx);

  const onThread: number[] = [];

  for (let start = 0; start < quoted.length; start += chunkSize) {
    const rows = await tx
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('sequence')
      .where('thread', '=', thread)
      .where('sequence', 'in', quoted.slice(start, start + chunkSize))
      .execute();

    onThread.push(...rows.map((row) => row.sequence));
  }

  const purges: ThreadPurge[] = [];

  for (const recordSequence of onThread.toSorted((left, right) => left - right)) {
    await writeRecordPurgeSet(tx, context, recordSequence);

    const itemIDs = await readPurgeSet(tx, recordSequence, ['active', 'retired', 'forgetting']);

    if (itemIDs.length > 0) {
      purges.push({ recordSequence, itemIDs });
    }
  }

  return purges;
}

const quotedSequenceSchema = z.object({ sequence: z.int().nullable() });

// Each record sequence that a version, an intent or a proposal quotes.
async function readQuotedSequences(tx: Transaction<unknown>): Promise<readonly number[]> {
  const tables = tx.$extendTables<MemoryTables>();

  const [evidence, intents, proposals] = await Promise.all([
    tables
      .selectFrom('memory_versions')
      .select(sql`json_extract(evidence, '$.recordSequence')`.as('sequence'))
      .execute(),
    tables
      .selectFrom('memory_versions')
      .select(sql`json_extract(intent_evidence, '$.recordSequence')`.as('sequence'))
      .execute(),
    tables
      .selectFrom('memory_proposals')
      .select(sql`json_extract(evidence, '$.recordSequence')`.as('sequence'))
      .execute(),
  ]);

  const sequences = [...evidence, ...intents, ...proposals].flatMap((row) => {
    const parsed = quotedSequenceSchema.parse(row);

    return parsed.sequence === null ? [] : [parsed.sequence];
  });

  return [...new Set(sequences)];
}
