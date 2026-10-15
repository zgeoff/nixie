import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface QueryRecorder {
  // passes each call through to the SDK's query()
  readonly runQuery: typeof query;

  // the options of every query() call, in order
  readonly options: readonly Options[];

  // resolves once the CLI reports that it queued the inbox message with this uuid
  readonly waitForQueued: (uuid: string) => Promise<void>;
}

// Builds a recorder around the SDK's query(). The CLI queues a message that arrives during a tool
// call, and reports it only through a command lifecycle that the SDK types leave out.
export function buildQueryRecorder(): QueryRecorder {
  const options: Options[] = [];

  const queued = new Set<string>();
  const waiters = new Map<string, () => void>();

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

            yield message;
          }
        },
      });
    },
    options,
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

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the SDK's message types have no readonly form
function findQueuedUUID(message: SDKMessage): string | null {
  const lifecycle = message as { type: string; state?: unknown; command_uuid?: unknown };

  return lifecycle.type === 'command_lifecycle' &&
    lifecycle.state === 'queued' &&
    typeof lifecycle.command_uuid === 'string'
    ? lifecycle.command_uuid
    : null;
}
