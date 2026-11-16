import { expect, test } from 'bun:test';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { startTestDefinitions } from './start-test-definitions';

test('it seeds the tasks that the repo folder holds', async () => {
  const ctx = await startTestDefinitions();

  await ctx.writeRepoTask('feed-the-cat', 'name: Feed the cat\nbrief: Feed the cat.\n');

  const result = await ctx.seed();
  const inForce = await readDefinitionsInForce(ctx.writer.db);

  expect(result.status).toBe('seeded');

  expect(inForce?.tasks).toStrictEqual([
    { id: 'feed-the-cat', hash: expect.any(String), origin: 'definitions' },
  ]);
});

test('it seeds no task once the repo folder is removed', async () => {
  const ctx = await startTestDefinitions();

  await ctx.writeRepoTask('feed-the-cat', 'name: Feed the cat\nbrief: Feed the cat.\n');
  await ctx.seed();
  await ctx.removeRepoTask('feed-the-cat');
  await ctx.seed();

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  expect(inForce?.tasks).toStrictEqual([]);
});
