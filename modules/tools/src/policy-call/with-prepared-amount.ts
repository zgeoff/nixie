import type { JSONObject } from '@heynixie/log';
import type { Prepared, RegisteredTool } from '../types';

// A prepared amount stands in for the argument the declaration names as the call's amount.
export function withPreparedAmount(
  args: JSONObject,
  registered: RegisteredTool | null,
  prepared: Prepared | null,
): JSONObject {
  const name = registered?.definition.declaration.amount ?? null;

  return prepared?.amount === undefined || name === null
    ? args
    : { ...args, [name]: prepared.amount };
}
