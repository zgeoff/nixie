import { closeCapture } from '../capture/close-capture';
import type { TurnInputsContext } from '../types';
import { runRetentionSweep } from './run-retention-sweep';

// Runs in the lane: the retention sweep, then a retry of the shred of every capture marked closing.
export async function runTurnInputSweep(ctx: TurnInputsContext): Promise<void> {
  await runRetentionSweep(ctx);

  for (const capture of [...ctx.open.values()].filter((open) => open.isClosing)) {
    try {
      await closeCapture(ctx, capture, { cause: 'step_end', callFrames: null });
    } catch {
      ctx.logger(
        'turn_input.close_failed',
        { captureID: capture.captureID, reason: 'retry' },
        'warn',
      );
    }
  }
}
