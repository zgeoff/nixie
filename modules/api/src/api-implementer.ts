import { contract } from '@heynixie/contract';
import { implement } from '@orpc/server';
import type { APIRequestContext } from './types';

// The contract's implementer with the API's request context, which each procedure group builds its
// handlers from, so the router type-checks every handler against the contract.
export const apiImplementer = implement(contract).$context<APIRequestContext>();
