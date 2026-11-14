import { waitForSettled } from '@heynixie/async';
import type { LogFields, Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { ConversationReset, ConversationResetOptions } from './run-conversation-reset';
import { runConversationReset } from './run-conversation-reset';
import type { ServerReset, ServerResetOptions } from './run-server-reset';
import { runServerReset } from './run-server-reset';
import type { Cleanup } from './types';

export interface ServerResetControl {
  readonly run: () => Promise<ServerReset>;
  readonly runConversations: () => Promise<ConversationReset>;

  readonly done: Promise<void>;

  readonly waitForSettled: () => Promise<void>;
}

export interface ServerResetControlOptions extends Omit<ServerResetOptions, 'stopWork'> {
  readonly work: Cleanup;

  // removes the request bodies that the turn-input log holds, after the log's own reset
  readonly runTurnInputsReset: () => Promise<void>;

  // removes the request bodies of the threads that a reset of the conversations covers
  readonly removeTurnInputThreads: (threads: readonly string[]) => Promise<void>;

  readonly closeAPI: () => Promise<void>;

  readonly readStart: () => Promise<void>;
  readonly log: Logger;

  readonly onFailure: (error: unknown) => void;
}

interface PendingResets {
  full: Promise<ServerReset> | null;
  conversations: Promise<ConversationReset> | null;
}

export function buildServerReset(options: ServerResetControlOptions): ServerResetControl {
  const done = Promise.withResolvers<void>();
  const pending: PendingResets = { full: null, conversations: null };

  return {
    run: () => {
      if (pending.conversations !== null) {
        return Promise.reject(new Error('a reset of the conversations runs already'));
      }

      pending.full ??= runLoggedReset(options, {
        mode: 'full',
        run: async (resetOptions) => {
          const reset = await runServerReset(resetOptions);

          await options.runTurnInputsReset();

          return reset;
        },
        toFields: (reset) => ({
          lastSequence: reset.lastSequence,
          keptSessions: reset.keptSessions,
        }),
        onDone: done.resolve,
      });

      return pending.full;
    },
    runConversations: () => {
      if (pending.full !== null) {
        return Promise.reject(new Error('a full reset runs already'));
      }

      pending.conversations ??= runLoggedReset(options, {
        mode: 'conversations',
        run: runConversationReset,
        toFields: (reset) => ({
          lastSequence: reset.lastSequence,
          shreddedRecords: reset.shreddedRecords,
        }),
        onDone: done.resolve,
      });

      return pending.conversations;
    },
    done: done.promise,
    waitForSettled: async () => {
      await waitForSettled(pending.full ?? pending.conversations);
    },
  };
}

interface ResetRun<Reset> {
  readonly mode: 'full' | 'conversations';
  readonly run: (options: ConversationResetOptions) => Promise<Reset>;
  readonly toFields: (reset: Reset) => LogFields;
  readonly onDone: () => void;
}

async function runLoggedReset<Reset>(
  options: ServerResetControlOptions,
  reset: ResetRun<Reset>,
): Promise<Reset> {
  options.log('reset.started', { mode: reset.mode });

  try {
    const finished = await runStoppedReset(options, reset.run);

    options.log('reset.finished', { mode: reset.mode, ...reset.toFields(finished) });
    reset.onDone();

    return finished;
  } catch (error) {
    options.log('reset.failed', { mode: reset.mode, ...toErrorFields(error) });
    options.onFailure(error);
    throw error;
  }
}

async function runStoppedReset<Reset>(
  options: ServerResetControlOptions,
  run: (options: ConversationResetOptions) => Promise<Reset>,
): Promise<Reset> {
  options.work.abort();

  await waitForSettled(options.readStart());

  return run({
    ...options,
    stopWork: async () => {
      await options.closeAPI();
      await options.work.stop();
    },
  });
}
