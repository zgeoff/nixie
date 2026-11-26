import { expect, test } from 'bun:test';
import { startGmailTools } from '../../test-utils/start-gmail-tools';
import { readPickedFiles } from './read-picked-files';

test('it names each picked file that the connection can read, and marks the others not visible', async () => {
  const ctx = await startGmailTools();

  const seeded = ctx.site.drive.seed({ name: 'Trip plan', text: 'Flights' });

  const picked = await readPickedFiles(ctx.deps, 'k3x9m2p7qa', [seeded.id, 'elsewhere']);

  expect(picked).toStrictEqual([
    { file: seeded.id, name: 'Trip plan', isVisible: true },
    { file: 'elsewhere', name: null, isVisible: false },
  ]);
});

test('it answers null for a connection that is not live', async () => {
  const ctx = await startGmailTools();
  const picked = await readPickedFiles(ctx.deps, 'unknownconn', ['a']);

  expect(picked).toBeNull();
});
