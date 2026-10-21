import { expect, mock, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import { startSkillLapseSweep } from './start-skill-lapse-sweep';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-sweep-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { writer, log: { writer, deploymentKey, projections: [] } };
}

test('it records the lapse of a proposal past its lapse time on the next sweep', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const sweep = startSkillLapseSweep({
    context: {
      log: ctx.log,
      clock: buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    intervalMs: 10,
    onError: () => {},
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(async () => {
    const lapses = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.write_lapsed'] });

    return lapses.length > 0;
  });

  await sweep.stop();

  const lapses = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.write_lapsed'] });

  expect(lapses.map((entry) => entry.record.payload)).toStrictEqual([{ proposalID: 'k3x9m2p7qa' }]);
});

test('it passes a failed sweep to onError, and sweeps again', async () => {
  const ctx = await setupTest();

  const onError = mock<(error: unknown) => void>();

  await ctx.writer.stop();

  const sweep = startSkillLapseSweep({
    context: {
      log: ctx.log,
      clock: buildTestClock(Date.UTC(2026, 2, 3, 9, 30)),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    intervalMs: 10,
    onError,
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => onError.mock.calls.length >= 2);

  expect(onError.mock.calls.slice(0, 2)).toStrictEqual([[expect.any(Error)], [expect.any(Error)]]);
});
