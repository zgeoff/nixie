import type { ReportedUsage } from '@heynixie/wire';
import { parseJSONOrNull } from '@heynixie/wire';
import { isRecord } from '../utils/is-record';
import type { ReadUsage, StreamEventKind, UsageDialect } from './usage-dialects';

// What the events of a stream say about whether the model began its reply
export interface StreamFacts {
  // an event other than an error or a ping arrived, so the model began a reply
  readonly started: boolean;

  // the type of the last error event, or null when the stream carried none
  readonly errorType: string | null;

  // the message of that error event, cut to 200 characters, or null
  readonly errorMessage: string | null;
}

// The stream ends for its reader only after the count is written, so a caller that read a whole
// reply never races its own next request past the count. A reader that stops early, or an upstream
// that breaks, still counts what the events reported; onProgress hears the usage after each event.
export function buildCountedStream(
  body: ReadableStream<Uint8Array>,
  dialect: UsageDialect,
  onEnd: (read: ReadUsage, complete: boolean, facts: StreamFacts) => Promise<void>,
  onProgress: (read: ReadUsage) => void = () => {},
): ReadableStream<Uint8Array> {
  const reader = body.getReader();

  const decoder = new TextDecoder();

  let pending = '';
  let reported: ReportedUsage = {};
  let ended = false;
  let facts: StreamFacts = { started: false, errorType: null, errorMessage: null };

  const seen = new Set<StreamEventKind>();

  const readEvents = (text: string) => {
    pending += text;

    const lines = pending.split('\n');

    pending = lines.pop() ?? '';

    for (const line of lines) {
      const event = readEventLine(line);

      if (event !== null) {
        seen.add(dialect.pickStreamEventKind(event));

        reported = dialect.foldStreamEvent(reported, event);
        facts = foldStreamFacts(facts, event);
      }
    }

    onProgress(dialect.parseUsage(reported, seen));
  };

  const finish = async (complete: boolean) => {
    if (ended) {
      return;
    }

    ended = true;

    readEvents(`${decoder.decode()}\n`);

    await onEnd(dialect.parseUsage(reported, seen), complete, facts);
  };

  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const chunk = await reader.read().then(
        (result) => ({ kind: 'read', result }) as const,
        (error: unknown) => ({ kind: 'failed', error }) as const,
      );

      if (chunk.kind === 'failed') {
        await finish(false);

        controller.error(chunk.error);

        return;
      }

      if (chunk.result.done) {
        await finish(true);

        controller.close();

        return;
      }

      readEvents(decoder.decode(chunk.result.value, { stream: true }));

      controller.enqueue(chunk.result.value);
    },
    cancel: async (reason) => {
      await finish(false);

      await reader.cancel(reason);
    },
  });
}

// an error reply that holds a JSON body in place of events arrives as one line with no data prefix
function readEventLine(line: string): unknown {
  if (line.startsWith('{')) {
    return parseJSONOrNull(line);
  }

  if (!line.startsWith('data:')) {
    return null;
  }

  return parseJSONOrNull(line.slice('data:'.length).trim());
}

function foldStreamFacts(facts: StreamFacts, event: unknown): StreamFacts {
  const type = isRecord(event) ? event['type'] : null;

  if (typeof type !== 'string' || type === 'ping') {
    return facts;
  }

  if (type === 'error') {
    return {
      ...facts,
      errorType: findErrorField(event, 'type') ?? 'unknown',
      errorMessage: findErrorField(event, 'message'),
    };
  }

  return { ...facts, started: true };
}

function findErrorField(event: unknown, field: 'type' | 'message'): string | null {
  const error = isRecord(event) ? event['error'] : null;
  const value = isRecord(error) ? error[field] : null;

  return typeof value === 'string' ? value.slice(0, 200) : null;
}
