import { expect, test } from 'bun:test';
import type { Prepared } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { FakeMailSeed } from '../../test-utils/fake-gmail/create-fake-gmail';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const reply = ctx.findAction('gmail.reply');

  const prepare = async (input: Record<string, string | boolean>): Promise<Prepared> => {
    const prepared = await reply.tool.prepare?.(
      { connection: 'k3x9m2p7qa', text: 'Thanks, got it.', ...input },
      ctx.buildContext(),
    );

    invariant(prepared !== undefined && 'destinations' in prepared, 'the reply prepares');

    return prepared;
  };

  const attempt = (input: Record<string, string | boolean>, prepared: Prepared) => {
    invariant(reply.queued, 'the reply runs queued');

    return reply.queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool: 'gmail.reply',
      arguments: { connection: 'k3x9m2p7qa', text: 'Thanks, got it.', ...input },
      attempt: 1,
      idempotencyKey: 'key-1',
      destinations: prepared.destinations,
      replyTargets: prepared.replyTargets ?? [],
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  const addMessage = (mail: Partial<FakeMailSeed> = {}) =>
    `k3x9m2p7qa.${ctx.site.gmail.seed({ from: 'Sam Lee <sam@example.org>', subject: 'Q3 numbers', text: 'Numbers.', ...mail }).id}`;

  return { ...ctx, prepare, attempt, addMessage };
}

test('it takes the recipient of a reply from the message, with its sender as the reply target', async () => {
  const ctx = await setupTest();
  const prepared = await ctx.prepare({ message: ctx.addMessage() });

  expect([prepared.destinations, prepared.replyTargets]).toStrictEqual([
    ['sam@example.org'],
    ['sam@example.org'],
  ]);
});

test('it adds the other recipients without the account itself when the reply answers all', async () => {
  const ctx = await setupTest();

  const prepared = await ctx.prepare({
    message: ctx.addMessage({
      to: ['me@example.test', 'lee@example.org'],
      cc: ['kim@example.org'],
    }),
    replyAll: true,
  });

  expect([prepared.destinations, prepared.replyTargets]).toStrictEqual([
    ['sam@example.org', 'lee@example.org', 'kim@example.org'],
    ['sam@example.org'],
  ]);
});

test('it makes a Reply-To address a destination with no reply target', async () => {
  const ctx = await setupTest();
  const prepared = await ctx.prepare({ message: ctx.addMessage({ replyTo: 'other@example.org' }) });

  expect([prepared.destinations, prepared.replyTargets]).toStrictEqual([['other@example.org'], []]);
});

test.each([
  { title: 'Spam', labels: ['SPAM'] },
  { title: 'Trash', labels: ['TRASH'] },
])('it marks no reply target for a message in $title', async (row) => {
  const ctx = await setupTest();
  const prepared = await ctx.prepare({ message: ctx.addMessage({ labels: row.labels }) });

  expect([prepared.destinations, prepared.replyTargets]).toStrictEqual([['sam@example.org'], []]);
});

test('it marks no reply target for a message of the account itself, and answers its recipients', async () => {
  const ctx = await setupTest();

  const prepared = await ctx.prepare({
    message: ctx.addMessage({ from: 'me@example.test', to: ['sam@example.org'], labels: ['SENT'] }),
  });

  expect([prepared.destinations, prepared.replyTargets]).toStrictEqual([['sam@example.org'], []]);
});

test('it fails the call of a message that does not exist', async () => {
  const ctx = await setupTest();

  const prepared = await ctx
    .findAction('gmail.reply')
    .tool.prepare?.(
      { connection: 'k3x9m2p7qa', text: 'Hi', message: 'k3x9m2p7qa.gone' },
      ctx.buildContext(),
    );

  expect(prepared).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_MESSAGE: no message has the ID k3x9m2p7qa.gone',
  });
});

test('it sends the reply in the thread of the message with the action as its Message-ID', async () => {
  const ctx = await setupTest();

  const message = ctx.addMessage({ messageID: 'orig-1@mail.test', threadID: 'thread-9' });

  const prepared = await ctx.prepare({ message });
  const response = await ctx.attempt({ message }, prepared);

  const [sent] = ctx.site.gmail.sent;

  expect([response, sent?.threadID, sent?.headers.map(([name]) => name)]).toStrictEqual([
    {
      kind: 'success',
      result: { message: expect.stringMatching(/^k3x9m2p7qa\./u), thread: 'k3x9m2p7qa.thread-9' },
    },
    'thread-9',
    expect.arrayContaining(['Message-ID', 'In-Reply-To', 'References', 'Subject']),
  ]);
});

test('it fails the action and sends to none when a recipient changed since the approval', async () => {
  const ctx = await setupTest();

  const message = ctx.addMessage({ id: 'm-fixed' });

  const prepared = await ctx.prepare({ message });

  ctx.addMessage({ id: 'm-fixed', replyTo: 'someone-else@example.net' });

  const response = await ctx.attempt({ message }, prepared);

  expect([response.kind, ctx.site.gmail.sent]).toStrictEqual(['destinations_changed', []]);
});

test('it fails the action and sends to none when the message moved to Spam since the approval', async () => {
  const ctx = await setupTest();

  const message = ctx.addMessage({ id: 'm-fixed' });

  const prepared = await ctx.prepare({ message });

  ctx.addMessage({ id: 'm-fixed', labels: ['SPAM'] });

  const response = await ctx.attempt({ message }, prepared);

  expect([response.kind, ctx.site.gmail.sent]).toStrictEqual(['destinations_changed', []]);
});
