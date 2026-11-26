import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { startTriggerSources } from '@heynixie/triggers';
import {
  readTestTriggerRows,
  seedWakeRule,
  startTestTriggers,
} from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import { startFakeGmailSite } from '../../../test-utils/fake-gmail/start-fake-gmail-site';
import type { GmailConnection } from './build-gmail-arrival-source';
import { buildGmailArrivalSource } from './build-gmail-arrival-source';

async function setupTest() {
  const triggers = await startTestTriggers();
  const site = await startFakeGmailSite();

  const pollIntervalMs = 120_000;

  await buildTaskSeeder({ context: triggers.context }).conversationStep();

  const connectionID = site.context.connectionID;

  const state: { connections: GmailConnection[] } = {
    connections: [{ connectionID, connection: site.context.connection, status: 'active' }],
  };

  const buildSource = (readContext: (id: string) => typeof site.context) =>
    buildGmailArrivalSource({
      clock: triggers.clock,
      hosts: site.hosts,
      logEvent: () => {},
      pollIntervalMs,
      listConnections: () => Promise.resolve(state.connections),
      readContext: (id) => Promise.resolve(readContext(id)),
    });

  const readCursor = async () => {
    const rows = await readTestTriggerRows(triggers);

    const cursor = rows.sources.find((row) => row.source_id === 'gmail')?.cursor;

    return cursor === null || cursor === undefined ? null : JSON.parse(cursor);
  };

  const readKinds = async (
    kind: 'trigger.mail_arrived' | 'trigger.mail_woke' | 'trigger.delivered',
  ) => {
    const records = await readRecords(triggers.context.log, { afterSequence: 0, kinds: [kind] });

    return records.map((entry) => entry.record);
  };

  const startSources = async (source: ReturnType<typeof buildSource>) => {
    const sources = await startTriggerSources([source], triggers.core);

    onTestFinished(() => sources.stop());
  };

  return {
    ...triggers,
    site,
    state,
    connectionID,
    pollIntervalMs,
    readCursor,
    readKinds,
    startSources,
    buildSource,
    addRule: (overrides: Parameters<typeof seedWakeRule>[1] = {}) =>
      seedWakeRule(triggers, { mailbox: { kind: 'gmail', connectionID }, ...overrides }),

    // the first poll stores the cursor, and the source then sleeps until the next one
    start: async () => {
      await startSources(buildSource(() => site.context));

      await waitFor(async () => {
        const cursor = await readCursor();

        expect(cursor).not.toBeNull();
        expect(triggers.clock.countPending()).toBe(1);
      });
    },

    // the clock moves, the next poll falls due and finishes, and the source sleeps again
    pollAgain: async (durationMs: number) => {
      const before = triggers.clock.delays.length;

      triggers.clock.advance(durationMs);

      await waitFor(() => {
        expect(triggers.clock.delays.length).toBeGreaterThan(before);
        expect(triggers.clock.countPending()).toBe(1);
      });
    },
  };
}

test('it delivers nothing at the first poll of a connection, and keeps its history ID', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.seed({ from: 'hello@library.example.org', subject: 'Old news' });

  await ctx.addRule();
  await ctx.start();

  const cursor = await ctx.readCursor();
  const arrivals = await ctx.readKinds('trigger.mail_arrived');

  expect(cursor).toStrictEqual({
    [ctx.connectionID]: { historyID: '1001', polledAt: ctx.clock.now() },
  });

  expect(arrivals).toStrictEqual([]);
});

test('it wakes the conversation with a new mail that a rule matches, as the model reads its ID', async () => {
  const ctx = await setupTest();

  await ctx.start();
  await ctx.addRule({ match: { from: ['@library.example.org'] } });

  ctx.clock.advance(1000);

  ctx.site.gmail.seed({
    id: 'm0001',
    threadID: 't0001',
    from: 'Library <hello@library.example.org>',
    subject: 'Your sign-in code',
    sentAtMs: ctx.clock.now(),
  });

  await ctx.pollAgain(ctx.pollIntervalMs);

  const [woke] = await ctx.readKinds('trigger.mail_woke');

  expect(woke?.payload).toMatchObject({
    mailbox: `gmail:${ctx.connectionID}`,
    mails: [{ messageID: 'k3x9m2p7qa.m0001', threadID: 't0001' }],
  });

  expect(woke?.erasable).toMatchObject({
    fields: { mails: [{ from: 'hello@library.example.org', subject: 'Your sign-in code' }] },
  });
});

test('it keeps nothing of a mail that no rule matches', async () => {
  const ctx = await setupTest();

  await ctx.start();
  await ctx.addRule({ match: { from: ['@school.example.org'] } });

  ctx.clock.advance(1000);

  ctx.site.gmail.seed({
    from: 'hello@library.example.org',
    subject: 'Your sign-in code',
    sentAtMs: ctx.clock.now(),
  });

  await ctx.pollAgain(ctx.pollIntervalMs);

  const arrivals = await ctx.readKinds('trigger.mail_arrived');
  const wakes = await ctx.readKinds('trigger.mail_woke');
  const rows = await readTestTriggerRows(ctx);

  expect([arrivals, wakes, rows.keys, rows.held]).toStrictEqual([[], [], [], []]);
});

test('it reads a mail that arrived before the rule was set, so a rule set during the poll window misses nothing', async () => {
  const ctx = await setupTest();

  await ctx.start();

  ctx.clock.advance(1000);

  ctx.site.gmail.seed({
    from: 'hello@library.example.org',
    subject: 'Early',
    sentAtMs: ctx.clock.now(),
  });

  await ctx.addRule();
  await ctx.pollAgain(ctx.pollIntervalMs);

  const wakes = await ctx.readKinds('trigger.mail_woke');

  expect(wakes).toHaveLength(1);
});

test.each([['SENT'], ['DRAFT'], ['SPAM'], ['TRASH']])(
  'it drops a mail labelled %s, so no rule meets it',
  async (label) => {
    const ctx = await setupTest();

    await ctx.start();
    await ctx.addRule();

    ctx.clock.advance(1000);

    ctx.site.gmail.seed({
      from: 'me@example.test',
      subject: 'Not an arrival',
      labels: [label],
      sentAtMs: ctx.clock.now(),
    });

    await ctx.pollAgain(ctx.pollIntervalMs);

    const arrivals = await ctx.readKinds('trigger.mail_arrived');

    expect(arrivals).toStrictEqual([]);
  },
);

test('it delivers one poll of one connection as one call with the whole cursor', async () => {
  const ctx = await setupTest();

  ctx.state.connections.push({
    connectionID: 'conn-two',
    connection: 'zz9y8x7w6v',
    status: 'active',
  });

  const both = ctx.buildSource((id) => ({
    ...ctx.site.context,
    connectionID: id,
    connection: id === 'conn-two' ? 'zz9y8x7w6v' : 'k3x9m2p7qa',
  }));

  await ctx.startSources(both);

  await waitFor(async () => {
    const delivered = await ctx.readKinds('trigger.delivered');

    const sizes = delivered.map((record) => Object.keys(record.payload['cursor'] ?? {}).length);

    expect(sizes).toStrictEqual([1, 2]);
  });
});

test('it reads Gmail again after a history that Gmail no longer keeps, and records a mail once', async () => {
  const ctx = await setupTest();

  await ctx.start();
  await ctx.addRule({ windowMs: 60_000 });

  ctx.clock.advance(1000);

  ctx.site.gmail.seed({
    id: 'm0001',
    from: 'a@example.org',
    subject: 'First',
    sentAtMs: ctx.clock.now(),
  });

  await ctx.pollAgain(ctx.pollIntervalMs);

  ctx.site.gmail.expireHistory();

  ctx.site.gmail.seed({
    id: 'm0002',
    from: 'a@example.org',
    subject: 'Second',
    sentAtMs: ctx.clock.now(),
  });

  await ctx.pollAgain(ctx.pollIntervalMs);

  const arrivals = await ctx.readKinds('trigger.mail_arrived');

  const listed = ctx.site.gmail.requests.some((line) => line.startsWith('GET /messages?q='));

  expect(arrivals.map((record) => record.payload)).toMatchObject([
    { messageID: 'k3x9m2p7qa.m0001' },
    { messageID: 'k3x9m2p7qa.m0002' },
  ]);

  expect(listed).toBe(true);
});

test('it keeps the cursor of a failed poll and polls again after a minute, then after 2', async () => {
  const ctx = await setupTest();

  await ctx.start();

  const cursor = await ctx.readCursor();

  const before = ctx.clock.delays.length;

  ctx.site.gmail.failures.push(
    { line: 'GET /history', status: 503 },
    { line: 'GET /history', status: 503 },
  );

  await ctx.pollAgain(ctx.pollIntervalMs);
  await ctx.pollAgain(60_000);

  const after = await ctx.readCursor();

  expect(ctx.clock.delays.slice(before)).toStrictEqual([60_000, 120_000]);
  expect(after).toStrictEqual(cursor);
});

test('it waits for the retry time that Google gives when that is longer than the backoff', async () => {
  const ctx = await setupTest();

  await ctx.start();

  const before = ctx.clock.delays.length;

  ctx.site.gmail.failures.push({
    line: 'GET /history',
    status: 429,
    body: '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}',
  });

  await ctx.pollAgain(ctx.pollIntervalMs);

  expect(ctx.clock.delays.slice(before)).toStrictEqual([60_000]);
});

test('it reports unhealthy after 3 failed polls in a row and running once a poll succeeds', async () => {
  const ctx = await setupTest();

  await ctx.start();

  ctx.site.gmail.failures.push(
    { line: 'GET /history', status: 503 },
    { line: 'GET /history', status: 503 },
    { line: 'GET /history', status: 503 },
  );

  await ctx.pollAgain(ctx.pollIntervalMs);
  await ctx.pollAgain(60_000);
  await ctx.pollAgain(120_000);

  const healths = () =>
    ctx.logged
      .filter((entry) => entry.event === 'trigger_source.health')
      .map((entry) => entry.fields);

  const unhealthy = healths().at(-1);

  await ctx.pollAgain(240_000);

  const running = healths().at(-1);

  expect(unhealthy).toMatchObject({ source: 'gmail', health: 'unhealthy' });
  expect(running).toMatchObject({ source: 'gmail', health: 'running' });
});

test('it drops the cursor entry of a connection that the list no longer holds', async () => {
  const ctx = await setupTest();

  await ctx.start();

  ctx.state.connections = [];

  ctx.clock.advance(ctx.pollIntervalMs);

  await waitFor(async () => {
    const cursor = await ctx.readCursor();

    expect(cursor).toStrictEqual({});
  });
});

test('it polls no connection that needs a new consent', async () => {
  const ctx = await setupTest();

  await ctx.start();

  const first = ctx.site.gmail.requests.length;

  ctx.state.connections = [
    { connectionID: ctx.connectionID, connection: 'k3x9m2p7qa', status: 'needs_consent' },
  ];

  ctx.clock.advance(ctx.pollIntervalMs);

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(1);
  });

  expect(ctx.site.gmail.requests).toHaveLength(first);
});

test('it makes read calls only', async () => {
  const ctx = await setupTest();

  await ctx.start();

  ctx.site.gmail.seed({ from: 'a@example.org', subject: 'Hi', sentAtMs: ctx.clock.now() });

  await ctx.pollAgain(ctx.pollIntervalMs);

  const writes = ctx.site.gmail.requests.filter((line) => !line.startsWith('GET '));

  expect(writes).toStrictEqual([]);
});
