import { contract } from '@heynixie/contract';
import { implement } from '@orpc/server';
import type { APIRequestContext } from './types';

export const apiImplementer = implement(contract).$context<APIRequestContext>();
