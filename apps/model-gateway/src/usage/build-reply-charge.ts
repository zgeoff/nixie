import { buildCallCost } from '@heynixie/models/prices';
import type { ModelCallUsage } from '@heynixie/wire';
import type { Measures, ProxyRoute } from '../types';
import type { ReplyEstimate } from './build-reply-estimate';
import { pickHighestRates } from './build-reply-estimate';

type BoundedEstimate = Extract<ReplyEstimate, { kind: 'bounded' }>;

export interface ReplyChargeRequest {
  readonly route: ProxyRoute;
  readonly estimate: BoundedEstimate;

  // what the reply reported before it ended, or null when it reported none
  readonly usage: ModelCallUsage | null;
}

// The output side is the output bound at the highest output rate. A cut stream from Anthropic's own
// API charges the input its first event reported, which is final there. Any other input side is the
// larger of the byte bound and the reported input.
export function buildReplyCharge(request: ReplyChargeRequest): Measures {
  const route = request.route;
  const estimate = request.estimate;
  const usage = request.usage;
  const rates = pickHighestRates(route);
  const outputDollars = (estimate.outputTokens * rates.output) / 1_000_000;
  const reportedInputTokens = usage === null ? 0 : sumInputTokens(usage);

  if (usage !== null && isAnthropicRoute(route)) {
    return {
      dollars: buildCallCost({ ...usage, outputTokens: 0 }, route.prices) + outputDollars,
      tokens: reportedInputTokens + estimate.outputTokens,
    };
  }

  const inputTokens = Math.max(estimate.inputTokens, reportedInputTokens);

  return {
    dollars: (inputTokens * rates.input) / 1_000_000 + outputDollars,
    tokens: inputTokens + estimate.outputTokens,
  };
}

function sumInputTokens(usage: ModelCallUsage): number {
  return (
    usage.uncachedInputTokens +
    usage.cacheWrite5mTokens +
    usage.cacheWrite1hTokens +
    usage.cacheReadTokens
  );
}

function isAnthropicRoute(route: ProxyRoute): boolean {
  return (
    route.api === 'anthropic-messages' && new URL(route.upstream).hostname === 'api.anthropic.com'
  );
}
