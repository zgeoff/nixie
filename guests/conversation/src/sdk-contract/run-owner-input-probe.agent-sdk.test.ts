import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runOwnerInputProbe } from './run-owner-input-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-owner-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it reads a next message after the running command ends, in the same turn', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'Bash', input: { command: 'sleep 0.5 && echo step-1' } } },
    { toolUse: { name: 'Bash', input: { command: 'echo step-2' } } },
    { text: 'DONE PINEAPPLE' },
  );

  const probe = await runOwnerInputProbe(ctx.target, 'after-command');

  const stepOne = probe.run.messages.findIndex(
    (message) =>
      message.type === 'user' && JSON.stringify(message.message.content).includes('step-1'),
  );

  const ownerRead = probe.run.messages.findIndex(
    (message) =>
      message.type === 'assistant' && (message.user_message_uuids ?? []).includes(probe.ownerUUID),
  );

  const firstResult = probe.run.messages.findIndex((message) => message.type === 'result');

  expect(stepOne).toBeGreaterThan(-1);
  expect(ownerRead).toBeGreaterThan(stepOne);
  expect(firstResult).toBeGreaterThan(ownerRead);
});

test('it keeps a queued next message through an interrupt, and the message starts the next turn', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'Bash', input: { command: 'sleep 20 && echo step-1' } } },
    { text: 'PINEAPPLE' },
  );

  const probe = await runOwnerInputProbe(ctx.target, 'through-interrupt');

  const results = probe.run.messages.flatMap((message) =>
    message.type === 'result' ? [message.subtype] : [],
  );

  expect(probe.receipt).toMatchObject({ still_queued: [probe.ownerUUID] });
  expect(results).toStrictEqual(['error_during_execution']);
  expect(probe.run.messages.at(-1)).toMatchObject({ type: 'assistant' });
});
