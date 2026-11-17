import { expect, test } from 'bun:test';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedEndedDefinitionRun } from '../test-utils/seed-ended-definition-run';
import { seedOpenDefinitionRun } from '../test-utils/seed-open-definition-run';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readTaskDirectory } from './read-task-directory';
import { readUnlistedProfiles } from './read-unlisted-profiles';

function setupTest() {
  return startTestTasks();
}

test("it returns the profile of the version that a definition task's newest ended task run pins, once the definition left force", async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Water the beds.', persona: 'default' },
  });

  await seedEndedDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  const unlisted = await readUnlistedProfiles(ctx.context, []);

  expect(unlisted).toStrictEqual([
    {
      taskID,
      name: 'Water the tomatoes',
      brief: 'Water the beds.',
      wakeable: false,
      speaker: 'persona_task',
    },
  ]);
});

test('it returns the profile of the version that an open task run pins, once the definition left force', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', persona: 'none' },
  });

  await seedOpenDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  const unlisted = await readUnlistedProfiles(ctx.context, []);

  expect(unlisted.map((profile) => [profile.taskID, profile.name, profile.speaker])).toStrictEqual([
    [taskID, 'Water the tomatoes', 'plain_task'],
  ]);
});

test('it returns no profile for a definition task that the directory lists', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes' },
  });

  const listed = await readTaskDirectory(ctx.context, { directory: [] });
  const unlisted = await readUnlistedProfiles(ctx.context, listed.directory);

  expect(listed.directory).toHaveLength(1);
  expect(unlisted).toStrictEqual([]);
});

test('it returns no profile for a definition task out of force that has no ended task run', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  const unlisted = await readUnlistedProfiles(ctx.context, []);

  expect(unlisted).toStrictEqual([]);
});
