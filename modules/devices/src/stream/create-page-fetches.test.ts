import { expect, test } from 'bun:test';
import { createPageFetches } from './create-page-fetches';

function setupTest() {
  const fetches = createPageFetches();

  fetches.declare(
    { deviceID: 'dev-1', region: 'pond' },
    {
      shown: 'shown-1',
      fetches: [{ url: 'https://tides.example/today', refreshMinutes: undefined }],
      isCovered: true,
    },
  );

  return {
    fetches,
    buildKey: (shown: string, url = 'https://tides.example/today') => ({
      deviceID: 'dev-1',
      region: 'pond',
      shown,
      url,
    }),
    fetched: {
      kind: 'body' as const,
      status: 200,
      type: 'application/json',
      body: '{}',
      fetchedAtMs: 1,
    },
  };
}

test('it answers pending for a declared fetch that returned nothing yet', () => {
  const ctx = setupTest();

  expect(ctx.fetches.read(ctx.buildKey('shown-1'))).toStrictEqual({ status: 'pending' });
});

test('it answers what a declared fetch returned', () => {
  const ctx = setupTest();

  ctx.fetches.record(ctx.buildKey('shown-1'), ctx.fetched);

  expect(ctx.fetches.read(ctx.buildKey('shown-1'))).toStrictEqual({
    status: 'done',
    result: ctx.fetched,
  });
});

test('it answers not declared for a URL the content did not name', () => {
  const ctx = setupTest();
  const read = ctx.fetches.read(ctx.buildKey('shown-1', 'https://other.example/x'));

  expect(read).toStrictEqual({ status: 'not_declared' });
});

test('it answers stale for content the region no longer shows', () => {
  const ctx = setupTest();

  expect(ctx.fetches.read(ctx.buildKey('shown-0'))).toStrictEqual({ status: 'stale' });
});

test('it keeps nothing of a fetch that the region no longer declares', () => {
  const ctx = setupTest();

  ctx.fetches.record(ctx.buildKey('shown-0'), ctx.fetched);
  ctx.fetches.record(ctx.buildKey('shown-1', 'https://other.example/x'), ctx.fetched);

  expect(ctx.fetches.readAll('dev-1', new Map([['pond', 'shown-1']]))).toStrictEqual([]);
});

test('it drops the results of the content before when new content declares fetches', () => {
  const ctx = setupTest();

  ctx.fetches.record(ctx.buildKey('shown-1'), ctx.fetched);

  ctx.fetches.declare(
    { deviceID: 'dev-1', region: 'pond' },
    {
      shown: 'shown-2',
      fetches: [{ url: 'https://tides.example/today', refreshMinutes: undefined }],
      isCovered: true,
    },
  );

  expect(ctx.fetches.read(ctx.buildKey('shown-2'))).toStrictEqual({ status: 'pending' });
});

test('it lists the results of the regions whose current content is the one named', () => {
  const ctx = setupTest();

  ctx.fetches.record(ctx.buildKey('shown-1'), ctx.fetched);

  expect([
    ctx.fetches.readAll('dev-1', new Map([['pond', 'shown-1']])),
    ctx.fetches.readAll('dev-1', new Map([['pond', 'shown-9']])),
  ]).toStrictEqual([
    [
      {
        region: 'pond',
        shown: 'shown-1',
        url: 'https://tides.example/today',
        result: ctx.fetched,
      },
    ],
    [],
  ]);
});

test('it forgets a region on remove', () => {
  const ctx = setupTest();

  ctx.fetches.remove('dev-1', 'pond');

  expect(ctx.fetches.readHeld('dev-1', 'pond')).toBeNull();
});
