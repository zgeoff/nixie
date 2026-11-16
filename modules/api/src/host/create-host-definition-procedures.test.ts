import { expect, test } from 'bun:test';
import { startTestDefinitions } from '@heynixie/definitions/test-utils';
import { createRouterClient } from '@orpc/server';
import { createHostDefinitionProcedures } from './create-host-definition-procedures';

async function setupTest() {
  const definitions = await startTestDefinitions();

  return {
    ...definitions,
    createClient: (isStarted: boolean) =>
      createRouterClient(
        createHostDefinitionProcedures(() => (isStarted ? definitions.context : null)),
      ),
  };
}

test('#resolve refuses while the server holds no definitions context', async () => {
  const ctx = await setupTest();

  const resolved = ctx
    .createClient(false)
    .resolve({ definitionID: 'water-the-tomatoes', keep: 'repo' });

  await Promise.allSettled([resolved]);

  expect(resolved).rejects.toMatchObject({ code: 'DEFINITIONS_NOT_STARTED' });
});

test('#resolve refuses a definition that has no conflict', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const resolved = ctx
    .createClient(true)
    .resolve({ definitionID: 'water-the-tomatoes', keep: 'repo' });

  await Promise.allSettled([resolved]);

  expect(resolved).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
