import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
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

  const sweep = startSkillExportSweep({ log: ctx.log, repo: ctx.repo, onError: () => {} });

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

  // the writer stops before the fallback stop runs, so no run may still be in flight then
  await sweep.stop();

  expect(ctx.repo.readPullRequests().map((request) => request.change.branch)).toStrictEqual([
    'nixie/skill/tide-tables',
  ]);
});

test('it passes a failed run to onError, and runs again each interval', async () => {
  const ctx = await setupTest();

  const onError = mock<(error: unknown) => void>();

  await ctx.writer.stop();

  const sweep = startSkillExportSweep({
    log: ctx.log,
    repo: ctx.repo,
    intervalMs: 10,
    onError,
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => onError.mock.calls.length >= 2);

  expect(onError.mock.calls.slice(0, 2)).toStrictEqual([[expect.any(Error)], [expect.any(Error)]]);
});
