import type { CallUsage } from '@heynixie/models';
import { isRecord } from './is-record';
import { parseJSONOrNull } from './parse-json-or-null';
import { parseReportedUsage } from './parse-reported-usage';

type ReportedFields = Readonly<Record<string, unknown>>;

// The stream ends for its reader only after the count is written, so a caller that read a whole
// reply never races its own next request past the count. A reader that stops early, or an upstream
// that breaks, still counts what the events reported so far.
export function buildCountedStream(
  body: ReadableStream<Uint8Array>,
  onEnd: (usage: CallUsage | null, complete: boolean) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();

  const decoder = new TextDecoder();

  let pending = '';
  let reported: ReportedFields = {};
  let ended = false;

  const readEvents = (text: string) => {
    pending += text;

    const lines = pending.split('\n');

    pending = lines.pop() ?? '';

    for (const line of lines) {
      reported = foldEventLine(reported, line);
    }
  };

  const finish = async (complete: boolean) => {
    if (ended) {
      return;
    }

    ended = true;

    readEvents(`${decoder.decode()}\n`);

    await onEnd(parseReportedUsage(reported), complete);
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

// message_start carries the input side of the usage and message_delta the running totals, so a
// later event's count replaces an earlier one's
function foldEventLine(reported: ReportedFields, line: string): ReportedFields {
  if (!line.startsWith('data:')) {
    return reported;
  }

  const event = parseJSONOrNull(line.slice('data:'.length).trim());

  if (!isRecord(event)) {
    return reported;
  }

  const usage = findEventUsage(event);

  if (usage === null) {
    return reported;
  }

  return {
    ...reported,
    ...Object.fromEntries(Object.entries(usage).filter(([, value]) => value !== null)),
  };
}

function findEventUsage(event: Readonly<Record<string, unknown>>): ReportedFields | null {
  if (event['type'] === 'message_start' && isRecord(event['message'])) {
    return toRecordOrNull(event['message']['usage']);
  }

  if (event['type'] === 'message_delta') {
    return toRecordOrNull(event['usage']);
  }

  return null;
}

function toRecordOrNull(value: unknown): ReportedFields | null {
  return isRecord(value) ? value : null;
}
