import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { requestDefinitionChange } from '../runtime-task/request-definition-change';
import { buildTestTaskYaml } from '../test-utils/build-test-task-yaml';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readRepoTasks } from './read-repo-tasks';

async function setupTest() {
  const ctx = await startTestDefinitions();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: {
      name: 'Feed the cat',
      brief: 'Feed the cat.',
      target: 'conversation',
      trigger: {
        schedule: { every: 'day', at: '07:00', zone: 'owner', catchUp: 'once' },
      },
    },
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  invariant(inForce);

  return { ...ctx, inForce };
}

test('it reads the repo task list that the seed record holds, without a runtime task', async () => {
  const ctx = await setupTest();
  const repoTasks = await readRepoTasks(ctx.writer.db, ctx.inForce);

  expect(repoTasks).toStrictEqual([{ id: 'water-the-tomatoes', hash: expect.any(String) }]);
});

test('it falls back to the snapshot entries of the repo for a seed record without the list', async () => {
  const ctx = await setupTest();

  const [seeded] = await readRecords(ctx.log, {
    afterSequence: ctx.inForce.recordSequence - 1,
    limit: 1,
  });

  invariant(seeded);

  const { repoTasks: stored, ...older } = seeded.record.payload;

  invariant(stored !== undefined);

  const [written] = await writeRecords(ctx.log, [
    { kind: 'definitions_seeded', definitions: seeded.record.definitions, payload: older },
  ]);

  invariant(written);

  const repoTasks = await readRepoTasks(ctx.writer.db, {
    ...ctx.inForce,
    recordSequence: written.sequence,
  });

  expect(repoTasks).toStrictEqual([{ id: 'water-the-tomatoes', hash: expect.any(String) }]);
});
