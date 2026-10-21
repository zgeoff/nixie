import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ContractClient } from './types';

export function buildQueryUtils(client: ContractClient) {
  return createTanstackQueryUtils(client, { path: ['nixie'] });
}
