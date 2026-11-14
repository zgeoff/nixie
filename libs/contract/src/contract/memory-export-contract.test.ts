import { expect, test } from 'bun:test';
import { memoryExportContract } from './memory-export-contract';

test('it refuses an export without its client action ID', () => {
  expect(
    memoryExportContract.export['~orpc'].inputSchema?.safeParse({}).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it declares a missing session, a store not started and a reused ID for an export', () => {
  expect(memoryExportContract.export['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'MEMORY_NOT_STARTED',
    'CLIENT_ACTION_ID_REUSED',
  ]);
});
