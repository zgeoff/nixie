import type { SandboxLimit } from '../types';
import { isLimitReached } from './is-limit-reached';

interface HeldSandbox {
  readonly micros: number;
  readonly tokens: number;
  readonly limit: SandboxLimit | null;
}

// Whether a sandbox's count has reached its own limit. A limit with no tokens never counts tokens.
export function isSandboxLimitReached(held: HeldSandbox): boolean {
  if (held.limit === null) {
    return false;
  }

  return (
    isLimitReached(held.micros, held.limit.dollars) ||
    (held.limit.tokens !== undefined && held.tokens >= held.limit.tokens)
  );
}
