import { expect, jest, onTestFinished, test } from 'bun:test';
import { subscribeToChanged } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startStandInMcp } from '../test-utils/start-stand-in-mcp';

async function setupTest() {
  const standIn = await startStandInMcp({
    tools: [
      { name: 'item_get', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
    ],
  });

  onTestFinished(() => standIn.mcp.stop());

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  const changedTopics: (readonly string[])[] = [];

  onTestFinished(
    subscribeToChanged(standIn.test.log.writer, (topics) => {
      changedTopics.push(topics);
    }),
  );

  return {
    ...standIn,
    changedTopics,
    readHealthChangeCount: async () => {
      const changes = await standIn.test.readHealthChanges();

      return changes.length;
    },
  };
}

test('it writes no health record at failures 1 and 2, one at the 3rd, and one on recovery, with each retry run by the backoff timer', async () => {
  const ctx = await setupTest();

  jest.useFakeTimers();

  onTestFinished(() => jest.useRealTimers());

  // Moves the test clock and the timers on by the backoff, then lets real time pass with reads of
  // the database, never moving the timers again: a listing's own timeout runs on the same timers.
  const runBackoffUntil = async (backoffMs: number, isDone: () => boolean) => {
    ctx.test.clock.advance(backoffMs);
    jest.advanceTimersByTime(backoffMs);

    for (let step = 0; step < 2000 && !isDone(); step += 1) {
      await ctx.mcp.readServers();
    }

    invariant(isDone(), 'the backoff timer ran the retry');
  };

  // Reads the database until the health records reach the count, with the same bound.
  const readUntilRecords = async (count: number) => {
    let records = await ctx.readHealthChangeCount();

    for (let step = 0; step < 2000 && records < count; step += 1) {
      await ctx.mcp.readServers();

      records = await ctx.readHealthChangeCount();
    }

    invariant(records >= count, 'the tracker wrote the health record');
  };

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  const afterOne = await ctx.readHealthChangeCount();

  await runBackoffUntil(60_000, () => ctx.mcp.readHealth('tracker').failures === 2);

  const afterTwo = await ctx.readHealthChangeCount();

  await runBackoffUntil(120_000, () => ctx.mcp.readHealth('tracker').failures === 3);
  await readUntilRecords(1);

  const afterThree = await ctx.test.readHealthChanges();

  ctx.site.failListings(false);

  await runBackoffUntil(240_000, () => ctx.mcp.readHealth('tracker').failures === 0);
  await readUntilRecords(2);

  const afterRecovery = await ctx.test.readHealthChanges();

  expect([afterOne, afterTwo, afterThree, afterRecovery]).toStrictEqual([
    0,
    0,
    [{ serverID: 'tracker', isUnhealthy: true, lastError: 'error', nextTryAt: expect.any(Number) }],
    [
      { serverID: 'tracker', isUnhealthy: true, lastError: 'error', nextTryAt: expect.any(Number) },
      { serverID: 'tracker', isUnhealthy: false, lastError: null, nextTryAt: null },
    ],
  ]);
});

test('it reads the need for a sign-in from the grant, and takes the unhealthy mark off a server whose grant ended', async () => {
  const ctx = await setupTest();

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');

  const unhealthy = await ctx.mcp.readSummaries();

  ctx.site.failListings(false);
  ctx.site.refuseRefresh(true);
  ctx.site.expireAccessTokens();

  const listed = await ctx.mcp.list('tracker');
  const summaries = await ctx.mcp.readSummaries();
  const changes = await ctx.test.readHealthChanges();

  expect([
    unhealthy.map((summary) => [summary.signIn, summary.health]),
    listed,
    summaries.map((summary) => [summary.signIn, summary.health]),
    changes.map((change) => change.isUnhealthy),
  ]).toStrictEqual([
    [['ok', 'unhealthy']],
    { status: 'skipped', reason: 'needs_sign_in' },
    [['needs_sign_in', 'healthy']],
    [true, false],
  ]);
});

test('it counts no failed listing for a server whose grant ended, so no backoff starts', async () => {
  const ctx = await setupTest();

  ctx.site.refuseRefresh(true);
  ctx.site.expireAccessTokens();

  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');

  const summaries = await ctx.mcp.readSummaries();
  const changes = await ctx.test.readHealthChanges();

  expect([
    summaries.map((summary) => [summary.signIn, summary.health]),
    ctx.mcp.readHealth('tracker').failures,
    changes,
  ]).toStrictEqual([[['needs_sign_in', 'healthy']], 0, []]);
});

test('it keeps the grant signed in and backs off when a listing gets 401 after a refresh that worked', async () => {
  const ctx = await setupTest();

  ctx.site.rejectTokens(true);

  const listed = await ctx.mcp.list('tracker');
  const summaries = await ctx.mcp.readSummaries();

  const health = ctx.mcp.readHealth('tracker');

  expect([
    listed.status,
    summaries.map((summary) => summary.signIn),
    health.failures,
    health.nextTryAtMs === null,
  ]).toStrictEqual(['failed', ['ok'], 1, false]);
});

test('it schedules no retry for a listing that fails while the stop waits for it', async () => {
  const ctx = await setupTest();

  jest.useFakeTimers();

  onTestFinished(() => jest.useRealTimers());

  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();

  ctx.site.failListings(true);

  ctx.site.onInitialize(() => {
    entered.resolve();

    return release.promise;
  });

  const listing = ctx.mcp.list('tracker');

  await entered.promise;

  const stopping = ctx.mcp.stop();

  release.resolve();

  await Promise.all([listing, stopping]);

  const listingsBefore = ctx.site.readListingCount();

  ctx.test.clock.advance(300_000);
  jest.advanceTimersByTime(300_000);

  for (let step = 0; step < 300; step += 1) {
    await ctx.mcp.readServers();
  }

  expect(ctx.site.readListingCount()).toBe(listingsBefore);
});

test('it tells an open page of the changed error and next try of a server that fails a 4th listing', async () => {
  const ctx = await setupTest();

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');

  const afterThree = ctx.changedTopics.length;
  const nextTryAfterThree = ctx.mcp.readHealth('tracker').nextTryAtMs;

  await ctx.mcp.list('tracker');
  await ctx.mcp.stop();

  expect([
    ctx.changedTopics.length > afterThree,
    ctx.mcp.readHealth('tracker').nextTryAtMs === nextTryAfterThree,
  ]).toStrictEqual([true, false]);
});
