import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { writeWrittenSkill } from './write-written-skill';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-snapshot-skills-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(root);

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

test('it loads a skill that nixie wrote with origin nixie, its approval and its files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
    { path: 'ports.md', text: '# Ports\n' },
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

  const seeded = await runWrittenSkillSeed({ log: ctx.log, policy });

  invariant(seeded.inForce);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills).toStrictEqual([
    {
      name: 'tide-tables',
      skillHash: skill.skillHash,
      origin: 'nixie',
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      frontmatter: skill.frontmatter,
      files: new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'],
        ['ports.md', '# Ports\n'],
      ]),
    },
  ]);
});

test('it loads a skill from your definitions with its origin and no approval', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  invariant(seeded.inForce);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills).toMatchObject([{ name: 'tide-tables', origin: 'definitions', approvalID: null }]);
});
