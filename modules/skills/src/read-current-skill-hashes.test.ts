import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkSkillFiles,
  createPathSource,
  runSeed,
  runWrittenSkillSeed,
  writeWrittenSkill,
  writeWrittenSkillState,
} from '@heynixie/definitions';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readCurrentSkillHashes } from './read-current-skill-hashes';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-current-skill-hashes-'));

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

test('it reads nothing before the first seed', async () => {
  const ctx = await setupTest();
  const current = await readCurrentSkillHashes(ctx.writer.db);

  expect(current).toStrictEqual(new Map());
});

test("it reads each skill nixie wrote over the snapshot's version, and the rest from the snapshot", async () => {
  const ctx = await setupTest();

  const tides = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';
  const stars = '---\nname: star-chart\ndescription: Reads a star chart.\n---\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await mkdir(join(ctx.root, 'skills', 'star-chart'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), tides);
  await writeFile(join(ctx.root, 'skills', 'star-chart', 'SKILL.md'), stars);
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const seededStars = checkSkillFiles('star-chart', [{ path: 'SKILL.md', text: stars }]);

  const approved = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: `${tides}By port.\n` },
  ]);

  invariant('skillHash' in seededStars);
  invariant('skillHash' in approved);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'p8w2n4c6ld',
      skill: approved,
      approvedAt: 1,
    }),
  );

  const current = await readCurrentSkillHashes(ctx.writer.db);

  expect(current).toStrictEqual(
    new Map([
      ['star-chart', seededStars.skillHash],
      ['tide-tables', approved.skillHash],
    ]),
  );
});

test("it reads your definitions' version of a retired skill nixie wrote before the retirement's seed runs", async () => {
  const ctx = await setupTest();

  const tides = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), tides);
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const definitions = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: tides }]);

  const approved = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: `${tides}By port.\n` },
  ]);

  invariant('skillHash' in definitions);
  invariant('skillHash' in approved);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'p8w2n4c6ld',
      skill: approved,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy: { rules: [], tools: [] } });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  const current = await readCurrentSkillHashes(ctx.writer.db);

  expect(current).toStrictEqual(new Map([['tide-tables', definitions.skillHash]]));
});
