import type { LogRecord as ContractRecord, LiveTopic } from '@heynixie/contract';
import {
  readRecords,
  startRecordWake,
  subscribeToChanged,
  subscribeToCommits,
} from '@heynixie/log';
import type { LogRecord, Writer } from '@heynixie/log';
import { withEventMeta } from '@orpc/server';
import type { APIContext, Identity } from '../types';
import { sessionRevokedCodec } from '../utils/session-revoked-codec';
import { pickLiveStart } from './pick-live-start';
import type { RemovedSequences } from './read-visible-record';
import { readVisibleRecord } from './read-visible-record';

export interface PageStream {
  readonly head: number;
  readonly afterSequence: number | undefined;
  readonly lastEventID: string | undefined;
  readonly thread: string | undefined;
  readonly clipPayloads: boolean | undefined;
  readonly signal: AbortSignal | undefined;

  readonly buildUnauthorized: () => Error;
}

type PageEvent =
  | { readonly kind: 'opened' }
  | { readonly kind: 'record'; readonly record: ContractRecord }
  | { readonly kind: 'changed'; readonly topics: LiveTopic[] };

const batchSize = 100;

// The events of a page's stream: opened once it listens on the writer's commits, then the records
// of the thread on screen in sequence order, and a changed event for each run of topics. A record
// that revokes the caller ends the stream, whether or not the page asked for a thread.
export async function* streamLivePage(
  context: APIContext,
  caller: Identity,
  stream: PageStream,
): AsyncGenerator<PageEvent, void, undefined> {
  const cursor = { after: pickLiveStart(stream) };

  const topics = new Set<LiveTopic>();

  const removed: RemovedSequences = { held: null };

  const wake = startRecordWake({
    subscribeToChanges: (onChange) => subscribeToLiveWrites(context.log.writer, topics, onChange),
    ...(stream.signal === undefined ? {} : { signal: stream.signal }),
  });

  try {
    yield { kind: 'opened' };

    while (stream.signal?.aborted !== true) {
      wake.reset();

      const batch = await readBatch(context, stream.thread, cursor.after);

      for (const entry of batch) {
        const record = entry.record;

        // A replay or a run of writes can fill every batch, so the topics that wait go out between
        // records, and a pause never waits for the replay to reach the head.
        yield* takeChanged(topics);
        cursor.after = record.sequence;

        if (isRevokeOfCaller(record, caller)) {
          throw stream.buildUnauthorized();
        }

        if (record.thread !== null && record.thread === stream.thread) {
          const visible = await readVisibleRecord(context, record, { removed, ...stream });

          yield withEventMeta(
            { kind: 'record' as const, record: visible },
            { id: String(record.sequence) },
          );
        }
      }

      yield* takeChanged(topics);

      if (batch.length < batchSize) {
        await wake.wait();
      }
    }
  } finally {
    wake.stop();
  }
}

function subscribeToLiveWrites(
  writer: Pick<Writer, 'commits'>,
  topics: Set<LiveTopic>,
  onChange: () => void,
): () => void {
  const stopCommits = subscribeToCommits(writer, onChange);

  const stopChanged = subscribeToChanged(writer, (changed) => {
    for (const topic of changed) {
      topics.add(topic);
    }

    onChange();
  });

  return () => {
    stopCommits();
    stopChanged();
  };
}

// A page with no thread reads only the records that could revoke it.
function readBatch(context: APIContext, thread: string | undefined, afterSequence: number) {
  return readRecords(context.log, {
    afterSequence,
    limit: batchSize,
    ...(thread === undefined ? { kinds: [sessionRevokedCodec.kind] } : {}),
  });
}

function* takeChanged(topics: Set<LiveTopic>): Generator<PageEvent, void, undefined> {
  if (topics.size === 0) {
    return;
  }

  const changed = [...topics];

  topics.clear();
  yield { kind: 'changed', topics: changed };
}

function isRevokeOfCaller(record: LogRecord, caller: Identity): boolean {
  return (
    record.kind === sessionRevokedCodec.kind &&
    sessionRevokedCodec.decode(record.payload).identityID === caller.identityID
  );
}
