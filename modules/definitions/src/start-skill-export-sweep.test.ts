import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { startSkillExportSweep } from './start-skill-export-sweep';
import { buildStubDefinitionsRepo } from './test-utils/build-stub-definitions-repo';
import { writeWrittenSkill } from './write-written-skill';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-export-sweep-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    writer,
    log: { writer, deploymentKey, projections: [] },
    repo: buildStubDefinitionsRepo(root),
  };
}

test('it exports a skill approved after it started once woken', async () => {
  const ctx = await setupTest();

  const sweep = startSkillExportSweep({
    log: ctx.log,
    repo: ctx.repo,
    text: { title: 'skills: {operation} {skill}', message: null, agentName: null, ownerName: null },
    onError: () => {},
  });

  onTestFinished(() => sweep.stop());

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  sweep.wake();

  await waitForCondition(() => ctx.repo.readPullRequests().length > 0);

  await sweep.stop();

  expect(ctx.repo.readPullRequests()).toMatchObject([
    { change: { branch: 'nixie/skill/tide-tables', title: 'skills: add tide-tables' } },
  ]);
});

test('it passes a failed run to onError, and runs again each interval', async () => {
  const ctx = await setupTest();

  const onError = mock<(error: unknown) => void>();
  const clock = buildTestClock(0);

  await ctx.writer.stop();

  const sweep = startSkillExportSweep({
    log: ctx.log,
    repo: ctx.repo,
    text: { title: null, message: null, agentName: null, ownerName: null },
    intervalMs: 3_600_000,
    clock,
    onError,
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => onError.mock.calls.length === 1 && clock.countSleepers() === 1);

  clock.advance(3_600_000);

  await waitForCondition(() => onError.mock.calls.length === 2);

  expect(onError.mock.calls).toStrictEqual([[expect.any(Error)], [expect.any(Error)]]);
});
