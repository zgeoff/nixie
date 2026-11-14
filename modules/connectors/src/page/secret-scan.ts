import type { Logger } from '@heynixie/logger';
import type { SecretFinder } from '@heynixie/secret-scan';
import type { ToolRun } from '@heynixie/tools';

// Asked only after a match, with the hop's number. true lets the URL through, and nothing is logged.
export type IsExempt = (hop: number) => Promise<boolean>;

export interface SecretScan {
  readonly findSecret: SecretFinder;
  readonly isExempt: IsExempt;

  // the server log, not the event log
  readonly logger: Logger;
}

// Whether a typed span of the run's thread holds the whole URL.
export type IsOwnerTyped = (run: ToolRun, url: string) => Promise<boolean>;

// What a call needs to build its scan: the finder and the log are the server's, the run is the
// call's.
export interface SecretScanSetup {
  readonly findSecret: SecretFinder;
  readonly isOwnerTyped: IsOwnerTyped;
  readonly run: ToolRun;
  readonly logger: Logger;

  // whether the exemption of a typed URL covers its redirects
  readonly typedURLCovers: 'named_url' | 'redirects';
}
