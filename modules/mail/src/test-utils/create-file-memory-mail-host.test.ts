import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildOutgoingMail } from '../parse/build-outgoing-mail';
import { createFileMemoryMailHost } from './create-file-memory-mail-host';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-host-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    options: {
      address: 'assistant@nixie.example.org',
      now: () => 5000,
      stateFile: join(directory, 'host.json'),
    },
  };
}

test('it keeps the unread mail, the sent mail and the IDs of a host that starts again over the file', async () => {
  const ctx = await setupTest();

  const host = createFileMemoryMailHost(ctx.options);

  const cursor = await host.begin();

  const arrived = host.deliver({ from: 'a@x.example.org', subject: 'Unread', text: 'Unread.' });

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

  const sent = await host.send(mail);

  const restarted = createFileMemoryMailHost(ctx.options);

  const changes = await restarted.readChanges(cursor);
  const found = await restarted.findSent('act1@nixie.example.org');

  const next = restarted.deliver({ from: 'b@x.example.org', subject: 'Next', text: 'Next.' });

  expect(changes).toMatchObject({
    kind: 'changes',
    mails: [{ hostMessageID: arrived.hostMessageID }],
  });

  expect(found).toStrictEqual(sent);
  expect(next.hostMessageID).not.toBe(arrived.hostMessageID);
});

test('it starts empty when the file does not exist', async () => {
  const ctx = await setupTest();

  const host = createFileMemoryMailHost(ctx.options);

  const cursor = await host.begin();
  const changes = await host.readChanges(cursor);

  expect(changes).toMatchObject({ kind: 'changes', mails: [] });
});
