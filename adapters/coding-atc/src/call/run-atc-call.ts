import type { AdapterReply } from '@heynixie/coding';
import { pickATCFailure } from './pick-atc-failure';
import type { ThrownCall } from './pick-atc-failure';

// Runs one fleet call. A call that throws becomes the reply the action queue takes, so a refused or
// unreachable gateway never reads as an empty answer.
export async function runATCCall<Value>(
  operation: () => Promise<Value>,
  call: ThrownCall,
): Promise<AdapterReply<Value>> {
  try {
    return { status: 'ok', value: await operation() };
  } catch (error) {
    return pickATCFailure(error, call);
  }
}
