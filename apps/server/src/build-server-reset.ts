import { waitForSettled } from '@heynixie/async';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { ServerReset, ServerResetOptions } from './run-server-reset';
import { runServerReset } from './run-server-reset';
import type { Cleanup } from './types';

export interface ServerResetControl {
  // runs the reset; a request while one runs gets that reset's answer
  readonly run: () => Promise<ServerReset>;

  // resolves once a reset finished, after which the server stops and exits 0
  readonly done: Promise<void>;

  // waits for a reset in flight to end either way, so a stop never closes a part under it
  readonly waitForSettled: () => Promise<void>;
}

export interface ServerResetControlOptions extends Omit<ServerResetOptions, 'stopWork'> {
  // the parts the start sequence started, which the reset stops before it destroys anything
  readonly work: Cleanup;

  // refuses the API calls that arrive during the reset, so none commits a write it then deletes
  readonly closeAPI: () => Promise<void>;

  // the start sequence, which the reset ends at its next step before it stops those parts
  readonly readStart: () => Promise<void>;
  readonly log: Logger;

  // a failed reset ends the server, so the container runtime starts it again with its work
  readonly onFailure: (error: unknown) => void;
}

// Builds the reset the control socket runs. The reset stops the work for good, so a reset that
// fails ends the server, and one that finishes stops it, and the normal start rebuilds the rest.
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

// the start sequence ends at its next step before the reset stops the parts it started
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
