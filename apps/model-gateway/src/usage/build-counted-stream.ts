import type { ReportedUsage } from '@heynixie/wire';
import { parseJSONOrNull } from '@heynixie/wire';
import { isRecord } from '../utils/is-record';
import type { ReadUsage, StreamEventKind, UsageDialect } from './usage-dialects';

// What the events of a stream say about whether the model began its reply
export interface StreamFacts {
  // an event other than an error or a ping arrived, or an event arrived that the gateway could not
  // read, so the model may have begun a reply
  readonly started: boolean;

  // the type of the last error event, or null when the stream carried none
  readonly errorType: string | null;

  // the message of that error event, cut to 200 characters, or null
  readonly errorMessage: string | null;
}

// The stream ends for its reader only after the count is written, so a caller that read a whole
// reply never races its own next request past the count. A reader that stops early, or an upstream
// that breaks, still counts what the events reported.
export function buildCountedStream(
  body: ReadableStream<Uint8Array>,
  dialect: UsageDialect,
  onEnd: (read: ReadUsage, complete: boolean, facts: StreamFacts) => Promise<void>,
  onProgress: (read: ReadUsage, facts: StreamFacts) => void = () => {},
): ReadableStream<Uint8Array> {
  const reader = body.getReader();

  const decoder = new TextDecoder();

  let pending = '';
  let dataLines: string[] = [];
  let reported: ReportedUsage = {};
  let ended = false;
  let facts: StreamFacts = { started: false, errorType: null, errorMessage: null };

  const seen = new Set<StreamEventKind>();

  // an event of the stream holds one or more data lines, joined with a newline, and ends at a blank
  // line
  const dispatchEvent = () => {
    if (dataLines.length === 0) {
      return;
    }

    const text = dataLines.join('\n');

    dataLines = [];

    const event = parseJSONOrNull(text);

    if (!isRecord(event)) {
      facts = { ...facts, started: facts.started || text.trim() !== '[DONE]' };

      return;
    }

    seen.add(dialect.pickStreamEventKind(event));

    reported = dialect.foldStreamEvent(reported, event);
    facts = foldStreamFacts(facts, event);
  };

  const readEvents = (text: string) => {
    pending += text;

    const lines = pending.split('\n');

    pending = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

      if (line === '') {
        dispatchEvent();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).replace(/^ /u, ''));
      }
    }

    onProgress(dialect.parseUsage(reported, seen), facts);
  };

  const finish = async (complete: boolean) => {
    if (ended) {
      return;
    }

    ended = true;

    readEvents(`${decoder.decode()}\n`);
    dispatchEvent();

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

// The model began no reply when the body ended with no event that starts one, or when an error event
// arrived and no reply had begun: an error event ends a stream. A stream that stops before either
// may have begun a reply in the events the gateway did not read.
export function isReplyAbsent(facts: StreamFacts, isEnded: boolean): boolean {
  return !facts.started && (isEnded || facts.errorType !== null);
}

function foldStreamFacts(
  facts: StreamFacts,
  event: Readonly<Record<string, unknown>>,
): StreamFacts {
  const type = event['type'];

  if (type === 'ping') {
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
