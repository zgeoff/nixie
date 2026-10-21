import { waitForSettled } from '@heynixie/async';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { ServerReset, ServerResetOptions } from './run-server-reset';
import { runServerReset } from './run-server-reset';
import type { Cleanup } from './types';

export interface ServerResetControl {
  readonly run: () => Promise<ServerReset>;

  readonly done: Promise<void>;

  readonly waitForSettled: () => Promise<void>;
}

export interface ServerResetControlOptions extends Omit<ServerResetOptions, 'stopWork'> {
  readonly work: Cleanup;

  readonly closeAPI: () => Promise<void>;

  readonly readStart: () => Promise<void>;
  readonly log: Logger;

  readonly onFailure: (error: unknown) => void;
}

export function buildServerReset(options: ServerResetControlOptions): ServerResetControl {
  const done = Promise.withResolvers<void>();
  const pending: { reset: Promise<ServerReset> | null } = { reset: null };

  return {
    run: () => {
      pending.reset ??= runLoggedReset(options, done.resolve);

      return pending.reset;
    },
    done: done.promise,
    waitForSettled: async () => {
      await waitForSettled(pending.reset);
    },
  };
}

async function runLoggedReset(
  options: ServerResetControlOptions,
  onDone: () => void,
): Promise<ServerReset> {
  options.log('reset.started');

  try {
    const reset = await runStoppedReset(options);

    options.log('reset.finished', {
      lastSequence: reset.lastSequence,
      keptSessions: reset.keptSessions,
    });

    onDone();

    return reset;
  } catch (error) {
    options.log('reset.failed', toErrorFields(error));
    options.onFailure(error);
    throw error;
  }
}

async function runStoppedReset(options: ServerResetControlOptions): Promise<ServerReset> {
  options.work.abort();

  await waitForSettled(options.readStart());

  return runServerReset({
    ...options,
    stopWork: async () => {
      await options.closeAPI();
      await options.work.stop();
    },
  });
}
