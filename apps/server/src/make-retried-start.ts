import { runWithRetry } from './run-with-retry';
import type { ServerPartValues } from './server-part-values';
import type { PartReader, ServerParts } from './types';

export function makeRetriedStart<Value>(
  step: keyof ServerPartValues,
  start: (parts: ServerParts, reader: PartReader<ServerPartValues>) => Promise<Value>,
): (reader: PartReader<ServerPartValues>) => Promise<Value> {
  return (reader) => {
    const parts = reader.get('server_parts');

    return runWithRetry(() => start(parts, reader), {
      step,
      signal: parts.cleanup.signal,
      log: parts.log,
      clock: parts.context.clock,
    });
  };
}
