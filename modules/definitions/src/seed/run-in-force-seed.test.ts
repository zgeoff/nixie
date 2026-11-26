import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, withWriteTransaction } from '@heynixie/log';
import { buildCheckerRules } from '@heynixie/memory';
import { tasksProjections } from '@heynixie/tasks';
import { writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import { triggersProjections } from '@heynixie/triggers';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { createPathSource } from '../definition/create-path-source';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { runSeed } from '../rule/run-seed';
import { checkSkillFiles } from '../skill/check-skill-files';
import { readSnapshotMcpOverrides } from '../snapshot/read-snapshot-mcp-overrides';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { writeWrittenSkill } from '../written/write-written-skill';
import { writeWrittenSkillState } from '../written/write-written-skill-state';
import { runInForceSeed } from './run-in-force-seed';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-seed-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() },
  });

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

test('it puts an approved skill in force at once, on the revision in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills: []\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'notes.md'), '# Notes\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);
  invariant(first.inForce);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const result = await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: {
      revision: first.inForce.revision,
      contentHash: first.inForce.contentHash,
      skills: [{ name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' }],
      conversationSkills: ['tide-tables'],
    },
    record: {
      payload: {
        revision: first.inForce.revision,
        skillChanges: { added: ['tide-tables'], changed: [], removed: [] },
        skipped: ['notes.md'],
      },
    },
  });
});

test('it gives a retired written skill back to the version beneath it, in its list place', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);
  invariant(first.inForce);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  const result = await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: {
      snapshotHash: first.inForce.snapshotHash,
      skills: first.inForce.skills,
      conversationSkills: ['tide-tables'],
    },
  });
});

test('it names the newest approval when a later approval brings back an earlier version', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const first = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const second = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  const approvals = [
    ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', 'k3vq8m2xpa', first],
    ['9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74', 'w7tn4c9rhz', second],
    ['c2d8e5f1-4a7b-4c90-9e3d-6b1f0a8c2e57', 'p5jd2x8kmq', first],
  ] as const;

  for (const [approvalID, proposalID, skill] of approvals) {
    await withWriteTransaction(ctx.writer, (tx) =>
      writeWrittenSkill(tx, { approvalID, proposalID, skill, approvedAt: 1 }),
    );

    await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });
  }

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  invariant(inForce);

  const rows = await sql`select approval_id from snapshot_skills
    where snapshot_hash = ${inForce.snapshotHash}`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([{ approval_id: 'c2d8e5f1-4a7b-4c90-9e3d-6b1f0a8c2e57' }]);
});

test('it writes nothing when the written skills already stand in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const result = await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });

  invariant(first.inForce);

  expect(result).toStrictEqual({ status: 'unchanged', inForce: first.inForce });
});

test('it marks an approval whose files your definitions already hold as yours, with their version, though the skills in force stay the same', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const result = await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });

  const states = await sql`select state, definitions_hash, definitions_origin
    from written_skills`.execute(ctx.writer.db);

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      payload: {
        adoptedSkills: [
          { name: 'tide-tables', approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31' },
        ],
      },
    },
  });

  expect(states.rows).toStrictEqual([
    { state: 'adopted', definitions_hash: skill.skillHash, definitions_origin: 'definitions' },
  ]);
});

test('it keeps the prompt overrides in force and builds the policy from them when it adds a written skill', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  content-checker:\n    safety: prompts/checker-safety.md\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'prompts'));
  await writeFile(join(ctx.root, 'prompts', 'checker-safety.md'), 'Refuse a guessed fact.\n');

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: (prompts) => ({
      rules: buildCheckerRules('Robin', prompts).map((rule) => ({
        id: rule.id,
        prompt: rule.prompt,
      })),
      tools: [],
    }),
  });

  invariant(first.inForce);

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

  const result = await runInForceSeed({
    log: ctx.log,
    buildPolicy: (prompts) => ({
      rules: buildCheckerRules('Robin', prompts).map((rule) => ({
        id: rule.id,
        prompt: rule.prompt,
      })),
      tools: [],
    }),
  });

  expect(result.inForce?.policyHash).toBe(first.inForce.policyHash);

  expect(result.inForce?.prompts).toStrictEqual({
    'content-checker': { parts: { safety: 'Refuse a guessed fact.' }, template: null },
  });
});

test('it refuses before the first seed', async () => {
  const ctx = await setupTest();

  const result = await runInForceSeed({
    log: ctx.log,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: { message: 'no definitions are in force yet' },
    inForce: null,
  });
});

test('it keeps the tasks list of the seed in force when it seeds again from stored state', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\n',
  );

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(first.inForce);

  const again = await runInForceSeed({
    log: ctx.log,
    buildPolicy: () => ({ rules: [{ id: 'allow-reads' }], tools: [] }),
  });

  expect(again).toMatchObject({ status: 'seeded', inForce: { tasks: first.inForce.tasks } });
  expect(again.inForce?.snapshotHash).not.toBe(first.inForce.snapshotHash);
  expect(first.inForce.tasks).toHaveLength(1);
});

test('it binds a task to each definition in force with target task', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const result = await runInForceSeed({
    log: { ...ctx.log, projections: tasksProjections },
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const tasks = await ctx.writer.db
    .$extendTables<{ tasks: { definition_id: string | null; definition_hash: string | null } }>()
    .selectFrom('tasks')
    .select(['definition_id', 'definition_hash'])
    .execute();

  expect(result.status).toBe('unchanged');

  expect(tasks).toStrictEqual([
    { definition_id: 'rain-gauge', definition_hash: inForce?.tasks[0]?.hash ?? null },
  ]);
});

test('it withdraws a one-shot that fired between 2 seeds from both hooks', async () => {
  const ctx = await setupTest();

  const log = { ...ctx.log, projections: [...tasksProjections, ...triggersProjections] };

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });
  await mkdir(join(ctx.root, 'tasks', 'dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\ntrigger:\n  schedule:\n    every: day\n    at: "08:00"\n',
  );

  await writeFile(
    join(ctx.root, 'tasks', 'dentist', 'task.yaml'),
    'name: Dentist\nbrief: Remind me.\ntrigger:\n  at: "2027-03-09T14:00:00Z"\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeTestTriggerFire(
    { log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
    'earlier-thread',
    {
      definitionHash: 'hash-0',
      definitionID: 'dentist',
      kind: 'at',
      dedupeKey: 'dentist|2027-03-09T14:00:00.000Z',
      scheduledFor: '2027-03-09T14:00:00.000Z',
    },
  );

  await runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) });

  const armed = await readRecords(log, { afterSequence: 0, kinds: ['trigger.armed'] });
  const bindings = await readRecords(log, { afterSequence: 0, kinds: ['task.definition_set'] });

  expect(armed.at(-1)?.record.payload).toStrictEqual({ armed: [], withdrawn: ['dentist'] });

  expect(bindings.at(-1)?.record.payload).toMatchObject({
    definitionID: 'dentist',
    definitionHash: null,
  });
});

test('it keeps the MCP overrides of the repo in the snapshot of a seed that only adopts a skill', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 6\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'mcp'));
  await writeFile(join(ctx.root, 'mcp', 'tracker.yaml'), 'item_get:\n  effects: [read]\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);
  invariant(first.inForce);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const second = await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });

  invariant(second.status === 'seeded');

  const overrides = {
    tracker: {
      item_get: {
        effects: ['read' as const],
        destinations: [],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  };

  expect([
    first.inForce.snapshotHash === second.inForce.snapshotHash,
    await readSnapshotMcpOverrides(ctx.writer.db, first.inForce.snapshotHash),
    await readSnapshotMcpOverrides(ctx.writer.db, second.inForce.snapshotHash),
  ]).toStrictEqual([false, overrides, overrides]);
});
