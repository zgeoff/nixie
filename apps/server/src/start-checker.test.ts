import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  const readSandboxes = async () => {
    const sandboxes = await Promise.all(
      nixie.guest.readSandboxIDs().map((id) => nixie.guest.adapter.read(id)),
    );

    return sandboxes.flatMap((sandbox) =>
      sandbox?.spec.owner === 'checker'
        ? [{ kind: sandbox.spec.kind, image: sandbox.spec.image }]
        : [],
    );
  };

  return { readSandboxes };
}

// The test manifest of write-boot-files holds a conversation image whose digest starts with 12 c's.
test('it creates the checker sandbox from the conversation image of the needed images', async () => {
  const ctx = await setupTest();

  await waitForCondition(async () => {
    const sandboxes = await ctx.readSandboxes();

    return sandboxes.length > 0;
  });

  const sandboxes = await ctx.readSandboxes();

  expect(sandboxes).toStrictEqual([{ kind: 'checker', image: 'nixie-conversation-cccccccccccc' }]);
});
