import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';

export interface PromptSeederDeps {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
}
