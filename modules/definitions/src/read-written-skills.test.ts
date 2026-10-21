import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { readWrittenSkills } from './read-written-skills';
import { writeWrittenSkill } from './write-written-skill';
import { writeWrittenSkillState } from './write-written-skill-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-read-written-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() },
  });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it reads only the written skills in force, in name order', async () => {
  const ctx = await setupTest();

  const tides = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const birds = checkSkillFiles('bird-log', [
    { path: 'SKILL.md', text: '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n' },
  ]);

  const kites = checkSkillFiles('kite-weather', [
    { path: 'SKILL.md', text: '---\nname: kite-weather\ndescription: Reads the wind.\n---\n' },
  ]);

  invariant('skillHash' in tides);
  invariant('skillHash' in birds);
  invariant('skillHash' in kites);

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
      skill: birds,
      approvedAt: 2,
    });

    await writeWrittenSkill(tx, {
      approvalID: 'c3d8e1f0-4a6b-4c27-9d15-2e8f7a0b6c43',
      proposalID: 'p2mx6v8tqd',
      skill: kites,
      approvedAt: 3,
    });

    await writeWrittenSkillState(tx, {
      approvalID: 'c3d8e1f0-4a6b-4c27-9d15-2e8f7a0b6c43',
      to: 'retired',
      at: 4,
    });
  });

  const written = await readWrittenSkills(ctx.writer.db);

  expect(written.map((skill) => skill.name)).toStrictEqual(['bird-log', 'tide-tables']);
});
