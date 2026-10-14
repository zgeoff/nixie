import { memoryConsolidationMigration } from './memory-consolidation-migration';
import { memoryGateMigration } from './memory-gate-migration';
import { memoryMigration } from './memory-migration';
import { memoryProposalMergesMigration } from './memory-proposal-merges-migration';
import { memoryShortIDsMigration } from './memory-short-ids-migration';
import { memoryWriterMigration } from './memory-writer-migration';
import type { Migration } from './types';

// The migrations of memory's tables, in the order the schema appends them.
export const memoryMigrations: readonly Migration[] = [
  memoryMigration,
  memoryWriterMigration,
  memoryGateMigration,
  memoryProposalMergesMigration,
  memoryShortIDsMigration,
  memoryConsolidationMigration,
];
