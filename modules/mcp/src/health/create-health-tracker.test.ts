import { expect, jest, onTestFinished, test } from 'bun:test';
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

  return {
    ...standIn,
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

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  const afterOne = await ctx.readHealthChangeCount();

  await runBackoffUntil(60_000, () => ctx.mcp.readHealth('tracker').failures === 2);

  const afterTwo = await ctx.readHealthChangeCount();

  await runBackoffUntil(120_000, () => ctx.mcp.readHealth('tracker').failures === 3);

  while ((await ctx.readHealthChangeCount()) < 1) {
    await ctx.mcp.readServers();
  }

  const afterThree = await ctx.test.readHealthChanges();

  ctx.site.failListings(false);

  await runBackoffUntil(240_000, () => ctx.mcp.readHealth('tracker').failures === 0);

  while ((await ctx.readHealthChangeCount()) < 2) {
    await ctx.mcp.readServers();
  }

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
