// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { LiveTopic } from '@heynixie/contract';
import { withEventMeta } from '@orpc/server';
import { deviceStore } from './device-store';
import { mockImplementer } from './mock-implementer';
import { mockLive, subscribeToMockChanged } from './mock-live';
import { requireMockSession } from './require-mock-session';
import { startMockChangeBridge } from './start-mock-change-bridge';
import { store } from './store';
import { toClippedLogRecord } from './to-clipped-log-record';

const os = mockImplementer;

startMockChangeBridge();

export const mockLiveProcedures = {
  follow: os.live.follow.handler(async function* followLive(options) {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    const input = options.input;

    if ('device' in input) {
      if (!deviceStore.hasDevice(session.sessionID)) {
        throw options.errors.NOT_A_DEVICE();
      }

      const generation = mockLive.recordOpen(undefined);

      try {
        yield { kind: 'opened' as const };

        yield {
          kind: 'device' as const,
          event: {
            kind: 'idle' as const,
            scene: [{ kind: 'markdown' as const, text: '# Saturday' }],
          },
        };

        if (deviceStore.layoutHolder.layout !== null) {
          yield {
            kind: 'device' as const,
            event: { kind: 'layout' as const, layout: deviceStore.layoutHolder.layout },
          };
        }

        await waitForAbort(options.signal);
      } finally {
        mockLive.recordClose(generation);
      }

      return;
    }

    const generation = mockLive.recordOpen(input.thread);

    try {
      yield* streamPage({ ...input, signal: options.signal });
    } finally {
      mockLive.recordClose(generation);
    }
  }),
};

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    signal?.addEventListener('abort', () => {
      resolve();
    });
  });
}

interface PageStream {
  readonly afterSequence?: number | undefined;
  readonly clipPayloads?: boolean | undefined;
  readonly thread?: string | undefined;
  readonly signal: AbortSignal | undefined;
}

async function* streamPage(stream: PageStream) {
  const signal = stream.signal;

  const pending = new Set<LiveTopic>();

  const wake = { resolve: (): void => {} };

  subscribeToMockChanged((topics) => {
    for (const topic of topics) {
      pending.add(topic);
    }

    wake.resolve();
  }, signal);

  const hookOptions = signal === undefined ? {} : { signal };

  store.records.hooks.on(
    'create',
    () => {
      setTimeout(() => {
        wake.resolve();
      }, 0);
    },
    hookOptions,
  );

  const cursor = { after: stream.afterSequence ?? readHeadSequence() };

  yield { kind: 'opened' as const };

  while (stream.signal?.aborted !== true) {
    for (const record of collectRecordsAfter(cursor.after, stream.thread)) {
      cursor.after = record.sequence;

      yield withEventMeta(
        { kind: 'record' as const, record: toClippedLogRecord(record, stream.clipPayloads) },
        { id: String(record.sequence) },
      );
    }

    if (pending.size > 0) {
      const topics = [...pending];

      pending.clear();
      yield { kind: 'changed' as const, topics };
    }

    await new Promise<void>((resolve) => {
      wake.resolve = resolve;

      signal?.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
  }
}

function readHeadSequence(): number {
  return store.records.all().reduce((head, record) => Math.max(head, record.sequence), 0);
}

function collectRecordsAfter(after: number, thread: string | undefined) {
  if (thread === undefined) {
    return [];
  }

  return store.records.findMany(
    (query) => query.where((record) => record.sequence > after && record.thread === thread),
    { orderBy: { sequence: 'asc' } },
  );
}
