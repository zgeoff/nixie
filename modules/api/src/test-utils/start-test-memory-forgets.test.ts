import { expect, test } from 'bun:test';
import { startTestAPI } from './start-test-api';
import { startTestMemoryForgets } from './start-test-memory-forgets';

async function setupTest() {
  const api = await startTestAPI();

  return { api, forgets: await startTestMemoryForgets(api.context) };
}

test('it answers a context whose session cleanup is set', async () => {
  const ctx = await setupTest();

  expect(ctx.forgets.forgetContext.readSessionCleanup()).toBeFunction();
  expect(ctx.api.context.readSessionCleanup()).toBeNull();
});
