import { buildCallCost } from '@heynixie/models/prices';
import type { Measures } from '../types';
import { buildCallTokens } from '../usage/build-call-tokens';
import { buildReplyCharge } from '../usage/build-reply-charge';
import type { CountedReply } from './accounting';

export type ReplyCharge =
  | { readonly kind: 'none' }
  | { readonly kind: 'usage'; readonly spend: Measures }
  | { readonly kind: 'estimate'; readonly spend: Measures }

  // the count falls behind the spend, and the field names what left the reply without a bound
  | { readonly kind: 'lost'; readonly field: string };

export function pickReplyCharge(reply: CountedReply): ReplyCharge {
  if (reply.usage !== null && reply.whole) {
    return {
      kind: 'usage',
      spend: {
        dollars: buildCallCost(reply.usage, reply.route.prices),
        tokens: buildCallTokens(reply.usage),
      },
    };
  }

  if (!reply.spent) {
    return { kind: 'none' };
  }

  if (reply.estimate === null) {
    return { kind: 'lost', field: 'endpoint' };
  }

  if (reply.estimate.kind === 'unbounded') {
    return { kind: 'lost', field: reply.estimate.field };
  }

  return {
    kind: 'estimate',
    spend: buildReplyCharge({
      route: reply.route,
      estimate: reply.estimate,
      usage: reply.usage,
      hasInput: reply.hasInput,
    }),
  };
}
