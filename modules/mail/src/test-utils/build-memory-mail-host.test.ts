import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
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
    cursor: { count: 2 },
    mails: [{ hostMessageID: expect.stringMatching(/^host-[0-9a-f]{8}-2$/u), receivedAt: 5000 }],
  });
});

test('it reads every mail of a host that started again as a resync, with IDs of its own', async () => {
  const ctx = setupTest();

  ctx.host.deliver({ from: 'a@x.example.org', subject: 'Old', text: 'Old.' });

  const begun = await ctx.host.begin();
  const earlier = await ctx.host.readChanges(begun);

  invariant(earlier.kind !== 'failed', 'the first host read');

  const restarted = buildMemoryMailHost({
    address: 'assistant@nixie.example.org',
    now: () => 6000,
  });

  const fresh = restarted.deliver({ from: 'b@x.example.org', subject: 'New', text: 'New.' });

  const changes = await restarted.readChanges(earlier.cursor);

  expect(changes).toMatchObject({
    kind: 'resynced',
    mails: [{ hostMessageID: fresh.hostMessageID }],
  });

  expect(fresh.hostMessageID).not.toBe(
    ctx.host.deliver({ from: 'a@x.example.org', subject: 'Again', text: 'Again.' }).hostMessageID,
  );
});

test('it fails the next read with the reason it was given', async () => {
  const ctx = setupTest();

  ctx.host.failNextRead('the host is down', 1000);

  const cursor = await ctx.host.begin();
  const changes = await ctx.host.readChanges(cursor);

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
    files: [],
    sentAt: 5000,
  });

  invariant(mail !== null, 'the draft is valid');

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
