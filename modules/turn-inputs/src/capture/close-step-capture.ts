import { listSpoolFiles } from '../intake/list-spool-files';
import type { OpenCapture, TurnInputsContext } from '../types';
import { closeCapture } from './close-capture';

// A step's end. It waits up to close_wait for the capture's unfinished files, which holds no lane,
// then closes the capture. Every error is caught and logged with a reason code, and the step goes
// on.
export async function closeStepCapture(
  ctx: TurnInputsContext,
  capture: OpenCapture,
  callFrames: number,
): Promise<void> {
  try {
    await waitForParts(ctx, capture);

    await ctx.lane.run(() => closeCapture(ctx, capture, { cause: 'step_end', callFrames }));
  } catch {
    ctx.logger(
      'turn_input.close_failed',
      { captureID: capture.captureID, reason: 'step_end' },
      'warn',
    );
  }
}

const pollMs = 100;

async function waitForParts(ctx: TurnInputsContext, capture: OpenCapture): Promise<void> {
  const directory = ctx.config?.sources[capture.source]?.directory;

  if (directory === undefined || ctx.config === null) {
    return;
  }

  const deadline = ctx.clock.now() + ctx.config.closeWaitMs;

  while (ctx.clock.now() < deadline) {
    const hasPart = await probePart(directory, capture.captureID);

    if (!hasPart) {
      return;
    }

    await ctx.clock.sleep(pollMs);
  }
}

async function probePart(directory: string, captureID: string): Promise<boolean> {
  const files = await listSpoolFiles(directory);

  return files.some((file) => file.parsed.kind === 'part' && file.parsed.captureID === captureID);
}
