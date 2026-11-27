import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../test-utils/start-gmail-tools';

interface LabelArgs {
  threads: string[];
  add: string[];
  remove: string[];
}

async function setupTest() {
  const ctx = await startGmailTools();

  const queued = ctx.findAction('gmail.label').queued;

  invariant(queued, 'gmail.label runs queued');

  const attempt = {
    actionID: 'action-1',
    tool: 'gmail.label',
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'key-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  };

  return {
    ...ctx,
    run: (args: LabelArgs) =>
      queued.run({ ...attempt, arguments: { connection: 'k3x9m2p7qa', ...args } }),
    check: (args: LabelArgs) => {
      invariant(queued.check, 'gmail.label has a check');

      return queued.check({ ...attempt, arguments: { connection: 'k3x9m2p7qa', ...args } });
    },
  };
}

test('it makes a user label that add names and Gmail lacks, then labels the thread', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'x' });

  const args = {
    threads: [`k3x9m2p7qa.${seeded.id}`],
    add: ['Reports'],
    remove: ['INBOX', 'UNREAD'],
  };

  const response = await ctx.run(args);

  expect([response, ctx.site.gmail.messages.get(seeded.id)?.labels]).toStrictEqual([
    { kind: 'success', result: { threads: [`k3x9m2p7qa.${seeded.id}`], created: ['Reports'] } },
    ['Label_1'],
  ]);
});

test('it ignores a label to remove that the account lacks', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'x' });

  const response = await ctx.run({
    threads: [`k3x9m2p7qa.${seeded.id}`],
    add: [],
    remove: ['Nothing'],
  });

  expect(response.kind).toBe('success');
});

test('it finds a label change that holds on each thread, and cannot tell which labels it made', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'x' });
  const args = { threads: [`k3x9m2p7qa.${seeded.id}`], add: ['Reports'], remove: ['INBOX'] };

  await ctx.run(args);

  const outcome = await ctx.check(args);

  expect(outcome).toStrictEqual({
    kind: 'found',
    result: { threads: [`k3x9m2p7qa.${seeded.id}`], created: null },
  });
});

test('it answers inconclusive when a label change does not hold', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'sam@example.org', subject: 'Q3', text: 'x' });

  const outcome = await ctx.check({
    threads: [`k3x9m2p7qa.${seeded.id}`],
    add: [],
    remove: ['INBOX'],
  });

  expect(outcome).toStrictEqual({
    kind: 'inconclusive',
  });
});

test('it answers inconclusive when only one message of a thread holds the label', async () => {
  const ctx = await setupTest();

  const first = ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Q3',
    text: 'x',
    threadID: 'thread-1',
  });

  ctx.site.gmail.seed({
    from: 'sam@example.org',
    subject: 'Re: Q3',
    text: 'y',
    threadID: 'thread-1',
    labels: ['INBOX'],
  });

  const stored = ctx.site.gmail.messages.get(first.id);

  invariant(stored, 'the message is seeded');

  stored.labels.push('STARRED');

  const outcome = await ctx.check({
    threads: ['k3x9m2p7qa.thread-1'],
    add: ['STARRED'],
    remove: [],
  });

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});
