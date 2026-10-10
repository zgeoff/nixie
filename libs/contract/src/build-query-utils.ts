import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ContractClient } from './types';

// Builds the TanStack Query options and keys for every procedure under the `nixie` key. Each
// client passes in its own oRPC client, so the link and the transport stay with the client.
export function buildQueryUtils(client: ContractClient) {
  return createTanstackQueryUtils(client, { path: ['nixie'] });
}
