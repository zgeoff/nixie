import { runWithRetry } from './run-with-retry';
import type { ServerPartValues } from './server-part-values';
import type { PartReader, ServerParts } from './types';

// Makes a part's start that runs again after each failure, as the start step of the part's name,
// so a part that needs impd, or a seed that is refused, keeps nixie live and unready. The part
// declares server_parts among its needs.
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
