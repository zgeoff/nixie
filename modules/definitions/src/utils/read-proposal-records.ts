import type { Log, LogRecord, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { SharedProposal } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

const idSchema = z.object({ proposalID: z.string() });
const bodyKinds = ['rules.rule_proposed', 'rules.mandate_proposed'] as const;

// The record that holds each row's body, keyed by the row's created sequence. The body record
// follows the one that created the row, and names the row's ID.
export async function readProposalRecords(
  log: Log,
  db: Kysely<unknown>,
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (rows.length === 0) {
    return new Map();
  }

  const found = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('kind', 'in', bodyKinds)
    .where(
      sql`json_extract(payload, '$.proposalID')`,
      'in',
      rows.map((row) => row.id),
    )
    .execute();

  const read = await readRecords(
    { ...log, writer: { ...log.writer, db } },
    { afterSequence: 0, sequences: found.map((row) => row.sequence), limit: found.length },
  );

  const bySequence = new Map(read.map((entry) => [entry.record.sequence, entry.record]));

  const sequenceByID = new Map(
    found.map((row) => [idSchema.parse(JSON.parse(row.payload)).proposalID, row.sequence]),
  );

  return new Map(
    rows.flatMap((row) => {
      const sequence = sequenceByID.get(row.id);
      const record = sequence === undefined ? undefined : bySequence.get(sequence);

      return record === undefined ? [] : [[row.createdSequence, record] as const];
    }),
  );
}
