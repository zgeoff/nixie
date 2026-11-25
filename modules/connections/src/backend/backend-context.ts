import type { BackendOptions } from '../types';

interface AccessToken {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

// What the backend's parts share: its options, the key IDs that this process minted and no row names
// yet, and the access tokens, which never reach a table.
export interface BackendContext extends BackendOptions {
  readonly heldKeys: Set<string>;

  // keyed by credential ID and removal counter, so a removal drops the entry's reach
  readonly accessTokens: Map<string, AccessToken>;
}
