import type { TurnInputsContext } from '../types';
import type { CaptureCloseCause } from '../utils/turn-inputs-tables';
import { closeCapture } from './close-capture';

export interface CloseCapturesOptions {
  readonly cause: CaptureCloseCause;

  // only the captures of these tasks, or every open capture with none
  readonly taskIDs?: readonly string[];
}

// Closes with the call frames unknown, so it writes no call-frame miss. For the causes forget, off
// and reset it throws when a shred failed, so the caller fails and reruns and never removes a
// request while a capture key lives.
export async function closeCaptures(
  ctx: TurnInputsContext,
  options: CloseCapturesOptions,
): Promise<void> {
  const failed = await ctx.lane.run(async () => {
    const captures = [...ctx.open.values()].filter(
      (capture) => options.taskIDs === undefined || options.taskIDs.includes(capture.taskID),
    );

    let count = 0;

    for (const capture of captures) {
      try {
        await closeCapture(ctx, capture, { cause: options.cause, callFrames: null });
      } catch {
        count += 1;

        ctx.logger(
          'turn_input.close_failed',
          { captureID: capture.captureID, reason: options.cause },
          'warn',
        );
      }
    }

    return count;
  });

  if (failed > 0 && options.cause !== 'start') {
    throw new Error(`${String(failed)} capture keys could not be shredded`);
  }
}
