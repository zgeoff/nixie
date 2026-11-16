import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  approveStarterRules,
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'allow-log-forget:\n  outcome: allow\n  tools: [log.forget]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  await approveStarterRules(nixie.configPath);

  const api = await createTestClient(nixie);

  nixie.guest.addReplies({ text: 'Noted.' });

  const sent = await sendClientMessage(
    api.client,
    { text: 'The shed key sits under the blue pot.' },
    'Noted.',
  );

  const target = sent.find((record) => record.kind === 'owner_message');

  invariant(target, 'the message is in the thread');

  return { nixie, api, target: target.sequence };
}

test('it removes the record with no approval when the rules allow the tool, and posts the notice', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'log.forget', input: { record: String(ctx.target) } } },
    { text: 'Removed it.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Forget my first message.' }, 'Removed it.');

  const read = await ctx.api.client.conversation.read({ thread: 'conversation' });
  const listed = await ctx.api.client.approvals.listItems();

  expect(listed.items.filter((entry) => entry.body?.fields['kind'] !== undefined)).toStrictEqual(
    [],
  );

  expect(read.records.find((record) => record.sequence === ctx.target)?.isRemoved).toBe(true);

  expect(read.records.find((record) => record.removal !== undefined)?.removal).toStrictEqual({
    kind: 'owner_message',
    sequence: ctx.target,
    callSequence: expect.any(Number),
  });
});

test('it ends the turn that made the call, runs its step again on a rebuilt session, and forgets the record once', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'log.forget', input: { record: String(ctx.target) } } },
    { text: 'Removed it.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Forget my first message.' }, 'Removed it.');

  const read = await ctx.api.client.conversation.read({ thread: 'conversation' });

  const kinds = read.records.map((record) => record.kind);
  const outcome = kinds.indexOf('action.outcome');
  const errored = kinds.indexOf('task.step_errored');
  const reply = kinds.lastIndexOf('model.reply');

  expect(kinds.filter((kind) => kind === 'record.forget_started')).toHaveLength(1);
  expect(kinds.slice(errored)).toContain('model.session_opened');
  expect(reply).toBeGreaterThan(outcome);
  expect(read.lastStepEnd?.kind).toBe('task.step_committed');
});
