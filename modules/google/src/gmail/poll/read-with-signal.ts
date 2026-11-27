import type { ConnectorContext } from '@heynixie/connections';

// One request through the connection's fetcher, ended when the signal aborts.
export function readWithSignal(
  context: ConnectorContext,
  signal: AbortSignal,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return context.fetch(input, { ...init, signal });
}
