import type { Definitions, Log } from '@heynixie/log';

export interface PlaceContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}
