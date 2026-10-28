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

test('it refuses a keep whose title holds only spaces', () => {
  expect(
    momentContract.keepMoment['~orpc'].inputSchema?.safeParse({
      clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
      thread: 'conversation',
      firstSequence: 4,
      lastSequence: 9,
      title: '   ',
    }).error?.issues,
  ).toPartiallyContain({ path: ['title'] });
});

test('it accepts a keep of a span with a title', () => {
  const payload = {
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: 4,
    lastSequence: 9,
    title: 'The day the boiler gave out',
  };

  expect(momentContract.keepMoment['~orpc'].inputSchema?.safeParse(payload).data).toStrictEqual(
    payload,
  );
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
