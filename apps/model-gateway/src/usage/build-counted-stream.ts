import type { ReportedUsage } from '@heynixie/wire';
import { parseJSONOrNull } from '@heynixie/wire';
import type { ReadUsage, StreamEventKind, UsageDialect } from './usage-dialects';

// The stream ends for its reader only after the count is written, so a caller that read a whole
// reply never races its own next request past the count. A reader that stops early, or an upstream
// that breaks, still counts what the events reported; onProgress hears the usage after each event.
export function buildCountedStream(
  body: ReadableStream<Uint8Array>,
  dialect: UsageDialect,
  onEnd: (read: ReadUsage, complete: boolean) => Promise<void>,
  onProgress: (read: ReadUsage) => void = () => {},
): ReadableStream<Uint8Array> {
  const reader = body.getReader();

  const decoder = new TextDecoder();

  let pending = '';
  let reported: ReportedUsage = {};
  let ended = false;

  const seen = new Set<StreamEventKind>();

  const readEvents = (text: string) => {
    pending += text;

    const lines = pending.split('\n');

    pending = lines.pop() ?? '';

    for (const line of lines) {
      reported = foldEventLine(dialect, reported, seen, line);
    }

    onProgress(dialect.parseUsage(reported, seen));
  };

  const finish = async (complete: boolean) => {
    if (ended) {
      return;
    }

    ended = true;

    readEvents(`${decoder.decode()}\n`);

    await onEnd(dialect.parseUsage(reported, seen), complete);
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

function foldEventLine(
  dialect: UsageDialect,
  reported: ReportedUsage,
  seen: Set<StreamEventKind>,
  line: string,
): ReportedUsage {
  if (!line.startsWith('data:')) {
    return reported;
  }

  const event = parseJSONOrNull(line.slice('data:'.length).trim());

  seen.add(dialect.pickStreamEventKind(event));

  return dialect.foldStreamEvent(reported, event);
}
