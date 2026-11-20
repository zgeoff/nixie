import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { commandLifecycleSchema } from '../turn/command-lifecycle-schema';

export interface QueryRecorder {
  readonly runQuery: typeof query;

  readonly options: readonly Options[];

  readonly waitForQueued: (uuid: string) => Promise<void>;

  // resolves when the model's reply first streams text
  readonly waitForText: () => Promise<void>;
}

export function buildQueryRecorder(): QueryRecorder {
  const options: Options[] = [];

  const queued = new Set<string>();
  const waiters = new Map<string, () => void>();

  const text = Promise.withResolvers<void>();

  return {
    runQuery: (params) => {
      options.push(params.options ?? {});

      const session = query(params);
      const read = session[Symbol.asyncIterator].bind(session);

      return Object.assign(session, {
        async *[Symbol.asyncIterator]() {
          for await (const message of { [Symbol.asyncIterator]: read }) {
            const uuid = findQueuedUUID(message);

            if (uuid !== null) {
              queued.add(uuid);
              waiters.get(uuid)?.();
            }

            if (isTextDelta(message)) {
              text.resolve();
            }

            yield message;
          }
        },
      });
    },
    options,
    waitForText: () => text.promise,
    waitForQueued: (uuid) => {
      if (queued.has(uuid)) {
        return Promise.resolve();
      }

      const waiter = Promise.withResolvers<void>();

      waiters.set(uuid, waiter.resolve);

      return waiter.promise;
    },
  };
}

function findQueuedUUID(message: SDKMessage): string | null {
  const lifecycle = commandLifecycleSchema.safeParse(message);

  return lifecycle.success && lifecycle.data.state === 'queued'
    ? (lifecycle.data.command_uuid ?? null)
    : null;
}

function isTextDelta(message: SDKMessage): boolean {
  return (
    message.type === 'stream_event' &&
    message.event.type === 'content_block_delta' &&
    message.event.delta.type === 'text_delta'
  );
}
