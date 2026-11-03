import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContractEnv, runOwnerInputProbe } from '@heynixie/conversation/sdk-contract';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-owner-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it reads a next message after the running command ends, in the same turn',
  async () => {
    const ctx = await setupTest();
    const probe = await runOwnerInputProbe(ctx.target, 'after-command');

    const stepOne = probe.run.messages.findIndex(
      (message) =>
        message.type === 'user' && JSON.stringify(message.message.content).includes('step-1'),
    );

    const ownerRead = probe.run.messages.findIndex(
      (message) =>
        message.type === 'assistant' &&
        (message.user_message_uuids ?? []).includes(probe.ownerUUID),
    );

    const firstResult = probe.run.messages.findIndex((message) => message.type === 'result');

    expect(stepOne).toBeGreaterThan(-1);
    expect(ownerRead).toBeGreaterThan(stepOne);
    expect(firstResult).toBeGreaterThan(ownerRead);
  },
  38_000,
);

test.skipIf(!isContractRun)(
  'it keeps a queued next message through an interrupt, and the message starts the next turn',
  async () => {
    const ctx = await setupTest();
    const probe = await runOwnerInputProbe(ctx.target, 'through-interrupt');

    const results = probe.run.messages.flatMap((message) =>
      message.type === 'result' ? [message.subtype] : [],
    );

    expect(probe.receipt).toMatchObject({ still_queued: [probe.ownerUUID] });
    expect(results).toStrictEqual(['error_during_execution']);
    expect(probe.run.messages.at(-1)).toMatchObject({ type: 'assistant' });
  },
  27_000,
);
