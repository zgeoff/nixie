import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkSkillFiles,
  createPathSource,
  readWrittenSkills,
  runSeed,
  runWrittenSkillSeed,
  writeWrittenSkill,
} from '@heynixie/definitions';
import { readRecords, startWriter, withWriteTransaction } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { writeWrittenSkillResolution } from './write-written-skill-resolution';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-resolution-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };
  const policy = { rules: [], tools: [] };

  return {
    log,
    root,
    policy,
    source: createPathSource({ directory: root }),
    context: {
      log,
      clock: buildTestClock(0),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      seedWrittenSkills: async () => {
        await runWrittenSkillSeed({ log, buildPolicy: () => policy });
      },
    },
  };
}

test("it puts the definitions' version back in force when you keep it", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const first = await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => ctx.policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, buildPolicy: () => ctx.policy });

  await writeWrittenSkillResolution(ctx.context, {
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    keep: 'definitions',
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.written_resolved', 'definitions_seeded'],
  });

  const last = records.at(-1)?.record;

  const written = await readWrittenSkills(ctx.log.writer.db);

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'definitions_seeded',
    'definitions_seeded',
    'skills.written_resolved',
    'definitions_seeded',
  ]);

  expect(records.at(-2)?.record.payload).toStrictEqual({
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    name: 'tide-tables',
    keep: 'definitions',
  });

  expect(last?.payload).toMatchObject({ skills: first.inForce?.skills });
  expect(written).toStrictEqual([]);
});

test("it puts the definitions' changed version in force, not the approval's base, when you keep it", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);
  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => ctx.policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);
  const changed = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By hour.\n` }]);

  invariant('skillHash' in skill);
  invariant('skillHash' in changed);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, buildPolicy: () => ctx.policy });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), `${text}By hour.\n`);
  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => ctx.policy });

  await writeWrittenSkillResolution(ctx.context, {
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    keep: 'definitions',
  });

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['definitions_seeded'] });

  expect(records.at(-1)?.record.payload).toMatchObject({
    skills: [{ name: 'tide-tables', skillHash: changed.skillHash, origin: 'definitions' }],
  });
});

test("it keeps nixie's version in force over a definitions change and closes the conflict", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);
  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => ctx.policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), `${text}By hour.\n`);
  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => ctx.policy });

  const seedWrittenSkills = mock(() => Promise.resolve());

  await writeWrittenSkillResolution(
    { ...ctx.context, seedWrittenSkills },
    { approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', keep: 'nixie' },
  );

  const written = await readWrittenSkills(ctx.log.writer.db);

  expect(written).toMatchObject([{ skillHash: skill.skillHash }]);
  expect(written[0]?.base).toStrictEqual(written[0]?.definitions);
  expect(seedWrittenSkills).toHaveBeenCalledOnce();
});

test('it refuses a choice for a skill nixie wrote that left force', async () => {
  const ctx = await setupTest();

  const refusal = await writeWrittenSkillResolution(ctx.context, {
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    keep: 'definitions',
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toMatchObject({ code: 'WRONG_STATE', state: null });
});
