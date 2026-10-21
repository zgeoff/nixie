import { contract } from '@heynixie/contract';
import { implement } from '@orpc/server';
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins';

interface MockAPIContext extends ResponseHeadersPluginContext {
  readonly sessionToken: string | undefined;
}

export const mockImplementer = implement(contract).$context<MockAPIContext>();
