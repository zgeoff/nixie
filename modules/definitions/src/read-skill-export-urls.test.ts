import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { readSkillExportURLs } from './read-skill-export-urls';
import { writeSkillExportState } from './write-skill-export-state';
import { writeWrittenSkill } from './write-written-skill';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-export-urls-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it reads the open pull request of each approval, and leaves out a closed one', async () => {
  const ctx = await setupTest();

  const tides = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const hours = checkSkillFiles('harbour-hours', [
    { path: 'SKILL.md', text: '---\nname: harbour-hours\ndescription: Reads the hours.\n---\n' },
  ]);

  invariant('skillHash' in tides);
  invariant('skillHash' in hours);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: tides,
      approvedAt: 1,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: hours,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 2,
    });

    await writeSkillExportState(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 8, url: 'https://definitions.test/pull/8' },
      at: 2,
    });

    await writeSkillExportState(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      to: 'closed',
      at: 3,
    });
  });

  const urls = await readSkillExportURLs(ctx.writer.db);

  expect(urls).toStrictEqual(
    new Map([['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', 'https://definitions.test/pull/7']]),
  );
});
