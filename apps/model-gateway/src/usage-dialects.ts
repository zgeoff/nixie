import type { ModelAPI, ModelCallUsage, ReportedUsage } from '@heynixie/wire';
import { foldAnthropicUsageEvent, parseAnthropicCallUsage } from '@heynixie/wire';
import { foldOpenAIResponseEvent } from './fold-openai-response-event';
import { parseOpenAICallUsage } from './parse-openai-call-usage';

export interface UsageDialect {
  // folds one server-sent event of a streamed reply into the usage it reported so far
  readonly foldStreamEvent: (reported: ReportedUsage, event: unknown) => ReportedUsage;

  // reads a reply's usage object, whole or folded from its stream, in nixie's form
  readonly parseUsage: (usage: unknown) => ModelCallUsage | null;
}

export const usageDialects: Readonly<Record<ModelAPI, UsageDialect>> = {
  'anthropic-messages': {
    foldStreamEvent: foldAnthropicUsageEvent,
    parseUsage: parseAnthropicCallUsage,
  },
  'openai-responses': {
    foldStreamEvent: foldOpenAIResponseEvent,
    parseUsage: parseOpenAICallUsage,
  },
};
