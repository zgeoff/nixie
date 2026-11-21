import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import type { ToolRun } from '@heynixie/tools';
import { encodeTestImage } from '../test-utils/encode-test-image';
import { showImage } from './show-image';

// A session with one slot, held by the call that draws. When the hold is freed, a rival call tries
// to take the slot on the next microtask, as a call beside the drawing one would.
function setupTest() {
  const state: { isReserved: boolean; rivalCouldHold: boolean | null } = {
    isReserved: false,
    rivalCouldHold: null,
  };

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: [],
    model: { model: 'model-a', profile: 'chat-direct' },
    session: {
      key: 'session-a',
      invalidatedThrough: 0,
      releaseImageRoom: () => {
        queueMicrotask(() => {
          state.rivalCouldHold = !state.isReserved;
        });
      },
      reserveImages: () => {
        state.isReserved = true;

        return true;
      },
    },
  };

  return { state, run };
}

test('it frees the hold only in the step that reserves the picture', async () => {
  const ctx = setupTest();

  const png = await encodeTestImage({ width: 100, height: 50 }, 'png');
  const shown = await showImage(ctx.run, png, 1568, 'call-a');

  await waitForCondition(() => ctx.state.rivalCouldHold !== null);

  expect(shown.image).not.toBeNull();
  expect(ctx.state.rivalCouldHold).toBe(false);
});
