import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildToolRegistry } from '../build-tool-registry';
import { buildMockToolDefinition } from '../test-utils/build-mock-tool-definition';
import type { ActionQueue, ToolImage } from '../types';
import { readQueuedResult } from './read-queued-result';

function setupTest() {
  const registered = buildToolRegistry([
    buildMockToolDefinition({
      name: 'test.screen',
      execution: 'queued',
      declaration: { effects: ['send'] },
    }),
  ]).findTool('test.screen');

  invariant(registered, 'the tool is registered');

  const picture: ToolImage = { mediaType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) };

  const queue: Pick<ActionQueue, 'waitForOutcome'> = {
    waitForOutcome: () =>
      Promise.resolve({ outcome: 'done', result: { text: 'a note' }, images: [picture] }),
  };

  return { registered, picture, queue };
}

test('it reserves the pictures of a finished action and returns them beside its result', async () => {
  const ctx = setupTest();
  const reserved: (readonly ToolImage[])[] = [];

  const settled = await readQueuedResult(ctx.registered, ctx.queue, {
    actionID: 'action-1',
    timeoutMs: 1000,
    reserveImages: (images) => {
      reserved.push(images);

      return true;
    },
  });

  expect(reserved).toStrictEqual([[ctx.picture]]);

  expect(settled).toMatchObject({
    reply: { kind: 'typed', result: { text: 'a note' }, images: [ctx.picture] },
  });
});

test('it leaves out the pictures of a finished action that the session budget refuses', async () => {
  const ctx = setupTest();

  const settled = await readQueuedResult(ctx.registered, ctx.queue, {
    actionID: 'action-1',
    timeoutMs: 1000,
    reserveImages: () => false,
  });

  expect(settled).toMatchObject({
    reply: { kind: 'typed', result: { text: 'a note' }, images: [] },
  });
});
