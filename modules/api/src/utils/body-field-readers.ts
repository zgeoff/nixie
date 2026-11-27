import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';

// What a feature adds to the card of its own tool's call: the extra fields, or none for a tool that
// is not its own.
export type BodyFieldReader = (
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
  defaultZone: string,
) => Promise<BodyFields>;

let added: readonly BodyFieldReader[] = [];

// The server sets the list at the start of each server, before any part starts. A feature that is
// off adds none.
export const bodyFieldReaders = {
  set: (readers: readonly BodyFieldReader[]): void => {
    added = readers;
  },
  list: (): readonly BodyFieldReader[] => added,
};
