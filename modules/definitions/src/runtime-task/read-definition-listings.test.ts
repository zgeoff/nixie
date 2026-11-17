import { expect, test } from 'bun:test';
import { seedLostTaskVersions } from '../test-utils/seed-lost-task-versions';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readDefinitionListings } from './read-definition-listings';

test('it lists a definition whose version is gone as out of force with no name', async () => {
  const ctx = await startTestDefinitions();

  await ctx.writeRepoTask('water-the-tomatoes', 'name: Water\nbrief: Water them.\n');
  await ctx.seed();

  await seedLostTaskVersions(ctx.writer);

  const listed = await readDefinitionListings(ctx.writer.db, {
    now: ctx.clock.now(),
    readZone: () => Promise.resolve('UTC'),
  });

  expect(listed).toMatchObject([
    { definitionID: 'water-the-tomatoes', name: null, isInForce: false },
  ]);
});
