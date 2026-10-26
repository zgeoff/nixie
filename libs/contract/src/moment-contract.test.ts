import { expect, test } from 'bun:test';
import { momentContract } from './moment-contract';

test('it refuses a destroy without its client action ID', () => {
  expect(
    momentContract.destroyMoment['~orpc'].inputSchema?.safeParse({
      momentID: 'f1d2c3b4a5',
      version: 2,
    }).error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it refuses a destroy preview without the version it binds to', () => {
  expect(
    momentContract.previewMomentDestroy['~orpc'].inputSchema?.safeParse({ momentID: 'f1d2c3b4a5' })
      .error?.issues,
  ).toPartiallyContain({ path: ['version'] });
});

test('it declares a missing session, a store not started, a missing moment, a stale version and a reused ID for a destroy', () => {
  expect(momentContract.destroyMoment['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'MEMORY_NOT_STARTED',
    'MOMENT_NOT_FOUND',
    'STALE_VERSION',
    'CLIENT_ACTION_ID_REUSED',
  ]);
});
