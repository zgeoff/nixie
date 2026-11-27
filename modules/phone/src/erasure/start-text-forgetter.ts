import type { ErasureHandle } from '@heynixie/log';
import { readRunningStep } from '@heynixie/tasks';
import type { PhoneContext, TextForgetter } from '../types';
import type { TextErasureRequest } from './start-text-erasure';

export interface TextForgetterOptions {
  readonly context: Pick<PhoneContext, 'log' | 'clock'>;

  // the runner's handle for a text, or null before the runner starts
  readonly readHandle: () => ErasureHandle<TextErasureRequest> | null;

  // how long a failed finish waits before it runs again
  readonly retryMs: number;
}

// The forget that the assistant starts on one text. The text hides at once, and the rest of the
// erasure waits for the calling step to end, because the session cleanup aborts every turn in
// flight. A finish that fails runs again until it ends or the forgetter stops.
export function startTextForgetter(options: TextForgetterOptions): TextForgetter {
  const cleanups = new Map<string, Promise<void>>();

  const state = { isStopping: false };

  const finishOnce = async (
    handle: ErasureHandle<TextErasureRequest>,
    targetID: string,
    thread: string,
    stepKey: string | null,
  ): Promise<boolean> => {
    try {
      let isRunning = await probeStepRunning(options.context, thread, stepKey);

      while (isRunning) {
        if (state.isStopping) {
          return false;
        }

        await Bun.sleep(options.retryMs);

        isRunning = await probeStepRunning(options.context, thread, stepKey);
      }

      await handle.finish(targetID);

      return true;
    } catch {
      return false;
    }
  };

  const runFinish = async (
    handle: ErasureHandle<TextErasureRequest>,
    targetID: string,
    thread: string,
  ): Promise<void> => {
    const running = await readRunningStep(options.context, thread);

    try {
      while (
        !state.isStopping &&
        !(await finishOnce(handle, targetID, thread, running?.stepKey ?? null))
      ) {
        await Bun.sleep(options.retryMs);
      }
    } finally {
      cleanups.delete(targetID);
    }
  };

  return {
    forgetBeside: async (request) => {
      const handle = options.readHandle();

      if (handle === null) {
        return { status: 'unavailable' };
      }

      const begun = await handle.begin({ text: request.text }, { by: 'assistant' });

      if (begun.status === 'refused') {
        return { status: 'refused' };
      }

      cleanups.set(begun.target.targetID, runFinish(handle, begun.target.targetID, request.thread));

      return { status: 'begun', shortID: begun.shortID ?? request.text };
    },
    waitForForgets: async () => {
      await Promise.all(cleanups.values());
    },
    stop: async () => {
      state.isStopping = true;

      await Promise.all(cleanups.values());
    },
  };
}

async function probeStepRunning(
  context: TextForgetterOptions['context'],
  thread: string,
  stepKey: string | null,
): Promise<boolean> {
  const running = await readRunningStep(context, thread);

  return stepKey !== null && running?.stepKey === stepKey;
}
