import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import { startPromptLapseSweep } from './start-prompt-lapse-sweep';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-sweep-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it records the lapse of a proposal past its lapse time on the hourly sweep', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const clock = buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000);

  const sweep = startPromptLapseSweep({
    context: { log: ctx.log, clock, definitions: () => ({ snapshotHash: 'snapshot-a' }) },
    clock,
    onError: () => {},
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => clock.countSleepers() > 0);

  clock.advance(60 * 60 * 1000);

  await waitForCondition(async () => {
    const lapses = await readRecords(ctx.log, {
      afterSequence: 0,
      kinds: ['prompts.override_lapsed'],
    });

    return lapses.length > 0;
  });

  await sweep.stop();

  const lapses = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_lapsed'],
  });

  expect(lapses.map((entry) => entry.record.payload)).toStrictEqual([{ proposalID: 'k3x9m2p7qa' }]);
});
