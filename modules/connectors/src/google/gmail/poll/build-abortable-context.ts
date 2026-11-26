import type { ConnectorContext } from '../../../types';
import { readWithSignal } from './read-with-signal';

// The connection's context with each request tied to the signal, so a stop ends a request that
// Gmail has not answered.
export function buildAbortableContext(
  context: ConnectorContext,
  signal: AbortSignal,
): ConnectorContext {
  return { ...context, fetch: readWithSignal.bind(null, context, signal) };
}
