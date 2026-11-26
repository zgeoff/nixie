import { publishChanged } from '@heynixie/log';
import type { CallsContext, ReconnectCause } from '../types';

// Marks a live call as waiting for a new offer from the carrying device, and tells the device's
// stream. A call that already waits keeps its first cause and time, so the 30 s limit counts from
// the first loss.
export function startReconnectWait(
  context: CallsContext,
  callID: string,
  cause: ReconnectCause,
): void {
  if (context.runtime.reconnects.has(callID)) {
    return;
  }

  context.runtime.reconnects.set(callID, { cause, sinceMs: context.clock.now() });

  publishChanged(context.log.writer, ['calls']);
}
