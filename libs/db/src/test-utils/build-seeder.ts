import type { Kysely } from 'kysely';
import { seedMemoryItemRow } from './seed-memory-item-row';
import { seedMemoryProposalRow } from './seed-memory-proposal-row';
import { seedNixiePauseRow } from './seed-nixie-pause-row';
import { seedRecordRow } from './seed-record-row';

export function buildSeeder(db: Kysely<unknown>) {
  return {
    record: (input?: Parameters<typeof seedRecordRow>[1]) => seedRecordRow(db, input),
    memoryItem: (input?: Parameters<typeof seedMemoryItemRow>[1]) => seedMemoryItemRow(db, input),
    memoryProposal: (input?: Parameters<typeof seedMemoryProposalRow>[1]) =>
      seedMemoryProposalRow(db, input),
    nixiePause: (input?: Parameters<typeof seedNixiePauseRow>[1]) => seedNixiePauseRow(db, input),
  };
}
