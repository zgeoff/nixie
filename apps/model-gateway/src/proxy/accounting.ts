import type { ModelCallUsage } from '@heynixie/wire';
import type { ProxyRoute } from '../types';
import type { ReplyEstimate } from '../usage/build-reply-estimate';

export type EstimateReason = 'no_usage' | 'cut' | 'upstream_failed' | 'body_failed' | 'shutdown';

// One reply, as the count sees it when the reply ends
export interface CountedReply {
  readonly routeID: string;
  readonly route: ProxyRoute;
  readonly sandbox: string | null;

  // null for an endpoint that does not spend
  readonly estimate: ReplyEstimate | null;

  // null when the reply reported none the proxy can read
  readonly usage: ModelCallUsage | null;

  // the reply reported its input classes in a start event or an input count
  readonly hasInput: boolean;

  // false for a stream that broke or was cancelled, a stream or body whose usage holds only part of
  // its counts, and a reply that never arrived
  readonly whole: boolean;

  // the reply spent for certain, or may have
  readonly spent: boolean;
  readonly reason: EstimateReason;
}

// What the handler asks of a count: whether a request may pass, and how a reply adds to it
export interface Accounting {
  // the refusal for a request on the route from the sandbox, or null when it may pass
  readonly admit: (route: string, sandbox: string | null) => Promise<Response | null>;

  // a reply that spent, or may have, with no whole usage the proxy can read, adds its estimate
  readonly count: (reply: CountedReply) => Promise<void>;
}
