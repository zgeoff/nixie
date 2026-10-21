import type { Kysely } from 'kysely';
import { ForgottenEvidenceError } from './forgotten-evidence-error';
import type { MemoryTables } from './types';

export async function requireLiveEvidence(
  db: Kysely<MemoryTables>,
  recordSequence: number,
): Promise<void> {
  const row = await db
    .selectFrom('memory_forgotten_evidence')
    .select('record_sequence')
    .where('record_sequence', '=', recordSequence)
    .limit(1)
    .executeTakeFirst();

  if (row !== undefined) {
    throw new ForgottenEvidenceError(recordSequence);
  }
}
