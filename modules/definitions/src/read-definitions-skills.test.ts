import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { readDefinitionsSkills } from './read-definitions-skills';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { writeWrittenSkill } from './write-written-skill';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-definitions-skills-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(join(root, 'skills'), { recursive: true });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    writer,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
  };
}

test('it reads each skill of your definitions under a snapshot with its list place', async () => {
  const ctx = await setupTest();

  const tides = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills: [tide-tables]\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), tides);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: tides }]);

  invariant(seeded.inForce);
  invariant('skillHash' in skill);

  const definitions = await readDefinitionsSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(definitions).toStrictEqual({
    skills: [{ name: 'tide-tables', skillHash: skill.skillHash, origin: 'definitions' }],
    conversationSkills: ['tide-tables'],
  });
});

test("it reads your definitions' version beneath a skill nixie wrote, and leaves out a new one", async () => {
  const ctx = await setupTest();

  const tides = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';
  const stars = '---\nname: star-chart\ndescription: Reads a star chart.\n---\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), tides);
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const beneath = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: tides }]);

  const changed = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: `${tides}By port.\n` },
  ]);

  const added = checkSkillFiles('star-chart', [{ path: 'SKILL.md', text: stars }]);

  invariant('skillHash' in beneath);
  invariant('skillHash' in changed);
  invariant('skillHash' in added);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: changed,
      approvedAt: 1,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'p8w2n4c6ld',
      skill: added,
      approvedAt: 1,
    });
  });

  const seeded = await runWrittenSkillSeed({ log: ctx.log, policy: { rules: [], tools: [] } });

  invariant(seeded.inForce);

  const definitions = await readDefinitionsSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(definitions).toStrictEqual({
    skills: [{ name: 'tide-tables', skillHash: beneath.skillHash, origin: 'definitions' }],
    conversationSkills: ['tide-tables'],
  });
});
