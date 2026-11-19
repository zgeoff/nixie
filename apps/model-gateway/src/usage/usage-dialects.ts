import type { ModelAPI, ModelCallUsage, ReportedUsage } from '@heynixie/wire';
import { foldAnthropicUsageEvent, parseAnthropicCallUsage } from '@heynixie/wire';
import { foldOpenAIResponseEvent } from './fold-openai-response-event';
import { parseOpenAICallUsage } from './parse-openai-call-usage';

// What a reply reported, and how much of the usage it holds
export interface ReadUsage {
  // the usage the reply reported, or null when it reported none the proxy can read
  readonly usage: ModelCallUsage | null;

  // the reply reported every side of its usage, so the usage is its final count
  readonly isFinal: boolean;

  // the reply reported its input classes in a start event or an input count, which is final for
  // the input side
  readonly hasInput: boolean;
}

// the events of a stream that change what a reply's usage holds
export type StreamEventKind = 'start' | 'final' | null;

export interface UsageDialect {
  // folds one server-sent event of a streamed reply into the usage it reported so far
  readonly foldStreamEvent: (reported: ReportedUsage, event: unknown) => ReportedUsage;

  // tells which events of a stream start the usage and which end it
  readonly pickStreamEventKind: (event: unknown) => StreamEventKind;

  // the event that ends the usage is the last of the reply, so a reader that stops after it still
  // saw the whole usage
  readonly isFinalEventLast: boolean;

  // reads the usage of a whole reply body, or of a stream folded so far with the kinds of event it
  // has seen
  readonly parseUsage: (reported: unknown, seen: ReadonlySet<StreamEventKind> | null) => ReadUsage;
}

export const usageDialects: Readonly<Record<ModelAPI, UsageDialect>> = {
  'anthropic-messages': {
    foldStreamEvent: foldAnthropicUsageEvent,
    pickStreamEventKind: (event) => {
      const type =
        typeof event === 'object' && event !== null && 'type' in event ? event.type : null;

      if (type === 'message_start') {
        return 'start';
      }

      return type === 'message_delta' && isOutputCountCarried(event) ? 'final' : null;
    },
    isFinalEventLast: false,
    parseUsage: parseAnthropicUsage,
  },
  'openai-responses': {
    foldStreamEvent: foldOpenAIResponseEvent,
    pickStreamEventKind: (event) => {
      const type =
        typeof event === 'object' && event !== null && 'type' in event ? event.type : null;

      return type === 'response.completed' ||
        type === 'response.incomplete' ||
        type === 'response.failed'
        ? 'final'
        : null;
    },
    isFinalEventLast: true,
    parseUsage: parseOpenAIUsage,
  },
};

// a message_delta ends the usage only when it carries the final output count
function isOutputCountCarried(event: unknown): boolean {
  const usage =
    typeof event === 'object' && event !== null && 'usage' in event ? event.usage : null;

  return (
    typeof usage === 'object' &&
    usage !== null &&
    'output_tokens' in usage &&
    typeof usage.output_tokens === 'number'
  );
}

function parseAnthropicUsage(
  reported: unknown,
  seen: ReadonlySet<StreamEventKind> | null,
): ReadUsage {
  const usage = parseAnthropicCallUsage(reported);
  const fields = typeof reported === 'object' && reported !== null ? reported : {};
  const hasInputCount = 'input_tokens' in fields && typeof fields.input_tokens === 'number';
  const hasOutputCount = 'output_tokens' in fields && typeof fields.output_tokens === 'number';

  if (seen === null) {
    return { usage, isFinal: hasInputCount && hasOutputCount, hasInput: hasInputCount };
  }

  const hasInput = seen.has('start') && hasInputCount;

  return { usage, isFinal: hasInput && seen.has('final'), hasInput };
}

function parseOpenAIUsage(reported: unknown): ReadUsage {
  const usage = parseOpenAICallUsage(reported);

  // the usage parses only when it holds both counts
  return { usage, isFinal: usage !== null, hasInput: false };
}
