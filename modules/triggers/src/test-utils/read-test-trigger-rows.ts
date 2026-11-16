import type { TriggersTables } from '../types';
import type { TestTriggers } from './start-test-triggers';

// The rows of the 3 trigger tables, for a test of the folds.
export async function readTestTriggerRows(triggers: Pick<TestTriggers, 'writer'>) {
  const db = triggers.writer.db.$extendTables<TriggersTables>();

  return {
    keys: await db.selectFrom('trigger_keys').selectAll().orderBy('sequence').execute(),
    sources: await db.selectFrom('trigger_sources').selectAll().orderBy('source_id').execute(),
    definitions: await db
      .selectFrom('trigger_definitions')
      .selectAll()
      .orderBy('definition_id')
      .execute(),
  };
}
