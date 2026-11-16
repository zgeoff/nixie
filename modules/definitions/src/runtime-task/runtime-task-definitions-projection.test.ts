import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildTestDefineInput } from '../test-utils/build-test-define-input';
import { buildTestTaskYaml } from '../test-utils/build-test-task-yaml';
import { readTestRuntimeTasks } from '../test-utils/read-test-runtime-tasks';
import { seedLostTaskVersions } from '../test-utils/seed-lost-task-versions';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { definitionSettledCodec } from './definition-settled-codec';
import { requestDefinitionChange } from './request-definition-change';
import { writeDefinitionResolution } from './write-definition-resolution';
import { writeTaskVersionRestore } from './write-task-version-restore';

async function setupTest() {
  const ctx = await startTestDefinitions();

  return {
    ...ctx,
    readRows: () => readTestRuntimeTasks(ctx.writer),
  };
}

test('it supersedes the change in force when a later change arrives', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: {
      ...buildTestDefineInput(),
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
    },
  });

  const rows = await ctx.readRows();

  expect(rows.map((row) => [row['operation'], row['state'], row['state_cause']])).toStrictEqual([
    ['add', 'superseded', 'later_change'],
    ['change', 'in_force', null],
  ]);

  expect(rows[0]?.['updated_sequence']).toBe(rows[1]?.['changed_sequence']);
});

test('it stores the version of a change in the versions table', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  const [row] = await ctx.readRows();

  const versions = await sql`select definition_id from task_definition_versions
    where definition_hash = ${String(row?.['definition_hash'])}`.execute(ctx.writer.db);

  expect(versions.rows).toStrictEqual([{ definition_id: 'water-the-tomatoes' }]);
});

test('it moves a change to adopted when a seed reads its version in the repo', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const [row] = await ctx.readRows();

  expect(row).toMatchObject({ state: 'adopted', state_cause: 'seed' });
});

test('it records the repo version that differs from the base of a change in force', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: {
      ...buildTestDefineInput(),
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
    },
  });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Soak them.' }));
  await ctx.seed();

  const [row] = await ctx.readRows();

  expect(row?.['state']).toBe('in_force');
  expect(row?.['definitions_hash']).not.toBe(row?.['base_hash']);
});

test('it ends a conflict in favour of nixie by moving the base to the repo version', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: {
      ...buildTestDefineInput(),
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
    },
  });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Soak them.' }));
  await ctx.seed();

  await writeDefinitionResolution(ctx.context, {
    definitionID: 'water-the-tomatoes',
    keep: 'nixie',
  });

  const [row] = await ctx.readRows();

  expect(row?.['state']).toBe('in_force');
  expect(row?.['base_hash']).toBe(row?.['definitions_hash']);
});

test('it retires a change when you keep the repo version', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: {
      ...buildTestDefineInput(),
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
    },
  });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Soak them.' }));
  await ctx.seed();

  await writeDefinitionResolution(ctx.context, {
    definitionID: 'water-the-tomatoes',
    keep: 'repo',
  });

  const [row] = await ctx.readRows();

  expect(row).toMatchObject({ state: 'retired', state_cause: 'kept_repo' });
});

test('it refuses a move that the transition table forbids', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const [row] = await ctx.readRows();

  invariant(row);

  const settled = writeRecords(ctx.log, [
    {
      kind: definitionSettledCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      payload: definitionSettledCodec.encode({
        changeID: String(row['change_id']),
        definitionID: 'water-the-tomatoes',
        outcome: 'retired',
        cause: 'one_shot_fired',
        hash: null,
      }),
    },
  ]);

  await Promise.allSettled([settled]);

  expect(settled).rejects.toThrow('is adopted, so it cannot become retired');
});

test('it rebuilds the same rows from the records', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: {
      ...buildTestDefineInput(),
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
    },
  });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Soak them.' }));
  await ctx.seed();

  const before = await ctx.readRows();

  await runProjectionRebuild(ctx.log);

  const rows = await ctx.readRows();

  expect(rows).toStrictEqual(before);
});

test('it restores the version of a change from its record when the versions table lacks it', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput() });

  const [row] = await ctx.readRows();

  await seedLostTaskVersions(ctx.writer);
  await runProjectionRebuild(ctx.log);
  await writeTaskVersionRestore(ctx.log);

  const versions = await sql`select definition_id from task_definition_versions
    where definition_hash = ${String(row?.['definition_hash'])}`.execute(ctx.writer.db);

  expect(versions.rows).toStrictEqual([{ definition_id: 'water-the-tomatoes' }]);
});
