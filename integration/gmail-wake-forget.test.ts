import { expect, onTestFinished, test } from 'bun:test';
import { startGoogleConnections } from '@heynixie/connections/test-utils';
import { buildGmailArrivalSource, buildGmailMailbox } from '@heynixie/google';
import { startFakeGmailSite } from '@heynixie/google/test-utils';
import { readRecords } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import {
  eraseConnectionMailbox,
  readConnectionWakeRecords,
  startTriggerSources,
} from '@heynixie/triggers';
import { seedWakeRule, startTestTriggers } from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const triggers = await startTestTriggers();
  const site = await startFakeGmailSite();

  await buildTaskSeeder({ context: triggers.context }).conversationStep();

  const google = await startGoogleConnections({
    sharedLog: { log: triggers.context.log, dataDir: triggers.writer.dataDir },
    eraseDependents: (connectionID) =>
      eraseConnectionMailbox(triggers.core, buildGmailMailbox(connectionID)),
    readWakes: async (tx, connectionID) => {
      const wakes = await readConnectionWakeRecords(tx, buildGmailMailbox(connectionID));

      return wakes.map((wake) => ({ sequence: wake.sequence, thread: wake.thread }));
    },
  });

  const connected = await google.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await google.readRows();

  invariant(row, 'the account is connected');

  const connectionID = row.connection_id;
  const connection = site.context.connection;

  const source = buildGmailArrivalSource({
    clock: triggers.clock,
    hosts: site.hosts,
    logEvent: () => {},
    pollIntervalMs: 120_000,
    db: triggers.writer.db,
    listConnections: () => Promise.resolve([{ connectionID, connection, status: 'active' }]),
    readContext: () => Promise.resolve({ ...site.context, connectionID }),
  });

  const sources = await startTriggerSources([source], triggers.core);

  onTestFinished(() => sources.stop());

  const readWakes = () =>
    readRecords(triggers.context.log, { afterSequence: 0, kinds: ['trigger.mail_woke'] });

  return { ...triggers, site, google, connectionID, readWakes };
}

test('it erases the subject of a Gmail mail from its wake record, and hands the wake to the session and request cleanup, when the account is forgotten', async () => {
  const ctx = await setupTest();

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(1);
  });

  await seedWakeRule(ctx, {
    mailbox: buildGmailMailbox(ctx.connectionID),
    match: { from: ['@library.example.org'] },
  });

  ctx.clock.advance(1000);

  ctx.site.gmail.seed({
    from: 'hello@library.example.org',
    subject: 'Heron-ledger-7Q2X',
    sentAtMs: ctx.clock.now(),
  });

  ctx.clock.advance(120_000);

  await waitFor(async () => {
    const woken = await ctx.readWakes();

    expect(woken).toHaveLength(1);
  });

  const [before] = await ctx.readWakes();

  invariant(before, 'the mail woke the conversation');

  ctx.google.effects.seedInput('conversation', before.record.sequence + 1);
  ctx.google.effects.seedInput('task-bees', 0);

  await ctx.google.connections.forget.begin({ connection: ctx.connectionID }, { by: 'user' });
  await ctx.google.connections.forget.finish(ctx.connectionID);

  const [after] = await ctx.readWakes();

  expect(JSON.stringify(before.record)).toInclude('Heron-ledger-7Q2X');
  expect(after?.record.erasable.status).not.toBe('readable');
  expect(JSON.stringify(after?.record)).not.toInclude('Heron-ledger-7Q2X');

  expect(ctx.google.effects.cleanedCauses).toStrictEqual([
    { recordSequence: before.record.sequence },
  ]);

  expect(ctx.google.effects.readInputs()).toStrictEqual([['task-bees', 0]]);
});
