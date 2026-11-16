import type { ModelCallUsage } from '@heynixie/wire';
import type { ProxyRoute } from '../types';

// What the handler asks of a count: whether a request may pass, and how a reply adds to it
export interface Accounting {
  // the refusal for a request from the sandbox, or null when it may pass
  readonly admit: (sandbox: string | null) => Promise<Response | null>;

  // required marks a reply that spent for certain, or may have, so one with no usage the proxy can
  // read leaves the count behind
  readonly count: (
    route: ProxyRoute,
    sandbox: string | null,
    usage: ModelCallUsage | null,
    required: boolean,
  ) => Promise<void>;

  // marks the count as behind the spend
  readonly loseCount: () => Promise<void>;
}
