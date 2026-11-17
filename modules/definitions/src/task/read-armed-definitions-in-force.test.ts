import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readArmedDefinitionsInForce } from './read-armed-definitions-in-force';

test('it leaves out a definition whose version is gone', async () => {
  const ctx = await startTestDefinitions();

  const armed = await withWriteTransaction(ctx.writer, (tx) =>
    readArmedDefinitionsInForce(tx, [
      { id: 'water-the-tomatoes', hash: 'f'.repeat(64), origin: 'definitions' },
    ]),
  );

  expect(armed).toStrictEqual([]);
});
