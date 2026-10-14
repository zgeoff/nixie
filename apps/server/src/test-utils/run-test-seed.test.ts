import { expect, test } from 'bun:test';
import { findDefinitionsInForce } from '@heynixie/definitions';
import { runTestSeed } from './run-test-seed';
import { startTestServer } from './start-test-server';

test('it puts the definitions it writes in force', async () => {
  const server = await startTestServer();

  const seeded = await runTestSeed(server.context.log, server.dataDir);
  const inForce = await findDefinitionsInForce(server.context.log.writer.db);

  expect(seeded.status).toBe('seeded');
  expect(inForce?.persona).toBe('# Persona\n\nPlain and kind.\n');
});
