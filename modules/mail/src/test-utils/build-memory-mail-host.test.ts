import { expect, test } from 'bun:test';
import { buildOutgoingMail } from '../parse/build-outgoing-mail';
import { buildMemoryMailHost } from './build-memory-mail-host';

function setupTest() {
  const host = buildMemoryMailHost({ address: 'assistant@nixie.example.org', now: () => 5000 });

  return { host };
}

test('it finds no mail at begin, and the mail that arrived after it at the next read', async () => {
  const ctx = setupTest();

  ctx.host.deliver({ from: 'a@x.example.org', subject: 'Old', text: 'Old.' });

  const cursor = await ctx.host.begin();

  ctx.host.deliver({ from: 'b@x.example.org', subject: 'New', text: 'New.' });

  const changes = await ctx.host.readChanges(cursor);

  expect(changes).toMatchObject({
    kind: 'changes',
    cursor: 2,
    mails: [{ hostMessageID: 'host-2', receivedAt: 5000 }],
  });
});

test('it fails the next read with the reason it was given', async () => {
  const ctx = setupTest();

  ctx.host.failNextRead('the host is down', 1000);

  const changes = await ctx.host.readChanges(0);

  expect(changes).toStrictEqual({ kind: 'failed', reason: 'the host is down', after: 1000 });
});

test('it finds a sent mail by its Message-ID', async () => {
  const ctx = setupTest();

  const mail = buildOutgoingMail({
    messageID: 'act1@nixie.example.org',
    from: 'assistant@nixie.example.org',
    to: ['a@x.example.org'],
    subject: 'Hello',
    text: 'Hello.',
    references: [],
    sentAt: 5000,
  });

  const sent = await ctx.host.send(mail);
  const found = await ctx.host.findSent('act1@nixie.example.org');
  const missing = await ctx.host.findSent('act2@nixie.example.org');

  expect([found, missing]).toStrictEqual([sent, null]);
});

test('it gives a hint when a mail arrives', async () => {
  const ctx = setupTest();

  const abort = new AbortController();

  const hints = ctx.host.watch?.(abort.signal)[Symbol.asyncIterator]();
  const first = hints?.next();

  ctx.host.deliver({ from: 'a@x.example.org', subject: 'Hi', text: 'Hi.' });

  const hint = await first;

  abort.abort();

  expect(hint?.done).toBe(false);
});
