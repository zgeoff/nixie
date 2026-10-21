import { memoryConsolidationCommentsMigration } from './memory-consolidation-comments-migration';
import { memoryConsolidationMigration } from './memory-consolidation-migration';
import { memoryConsolidationSummaryMigration } from './memory-consolidation-summary-migration';
import { memoryGateMigration } from './memory-gate-migration';
import { memoryMigration } from './memory-migration';
import { memoryProposalMergesMigration } from './memory-proposal-merges-migration';
import { memoryShortIDsMigration } from './memory-short-ids-migration';
import { memoryWriterMigration } from './memory-writer-migration';
import type { Migration } from './types';

export const memoryMigrations: readonly Migration[] = [
  memoryMigration,
  memoryWriterMigration,
  memoryGateMigration,
  memoryProposalMergesMigration,
  memoryShortIDsMigration,
  memoryConsolidationMigration,
  memoryConsolidationCommentsMigration,
  memoryConsolidationSummaryMigration,
];
