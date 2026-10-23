import { expect, test } from 'bun:test';
import { createApprovedItems } from './create-approved-items';
import { createTestClient } from './create-test-client';
import { runHostCommand } from './run-host-command';
import { startTestNixie } from './start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it approves each text the turn proposed as an active item of yours, in the order given', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx.nixie);

  const items = await createApprovedItems(ctx.nixie, api.client, [
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  const shown = await runHostCommand(ctx.nixie.configPath, ['memory-show', items[0].itemID]);

  expect(items.map((item) => item.text)).toStrictEqual([
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  expect(JSON.parse(shown.stdout)).toMatchObject({
    state: 'active',
    versions: [{ version: 1, origin: 'conversation', text: 'Allergic to hazelnuts' }],
  });
});
