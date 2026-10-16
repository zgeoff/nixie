import { contract } from '@heynixie/contract';
import { implement } from '@orpc/server';
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins';

interface MockAPIContext extends ResponseHeadersPluginContext {
  // The device session's token, from the bearer header or the cookie.
  readonly sessionToken: string | undefined;
}

// The contract's implementer with the mock API's request context, which each group of mock
// procedures builds its handlers from.
export const mockImplementer = implement(contract).$context<MockAPIContext>();
