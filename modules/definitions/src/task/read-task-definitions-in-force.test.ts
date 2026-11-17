import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readTaskDefinitionsInForce } from './read-task-definitions-in-force';

test('it leaves out a definition whose version is gone', async () => {
  const ctx = await startTestDefinitions();

  const inForce = await withWriteTransaction(ctx.writer, (tx) =>
    readTaskDefinitionsInForce(tx, [
      { id: 'water-the-tomatoes', hash: 'f'.repeat(64), origin: 'definitions' },
    ]),
  );

  expect(inForce).toStrictEqual([]);
});

test('it lists a definition whose version is stored and enabled', async () => {
  const ctx = await startTestDefinitions();

  await ctx.writeRepoTask('water-the-tomatoes', 'name: Water\nbrief: Water them.\n');
  await ctx.seed();

  const seeded = await readDefinitionsInForce(ctx.writer.db);

  const inForce = await withWriteTransaction(ctx.writer, (tx) =>
    readTaskDefinitionsInForce(tx, seeded?.tasks ?? []),
  );

  expect(inForce).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
    },
  ]);
});
