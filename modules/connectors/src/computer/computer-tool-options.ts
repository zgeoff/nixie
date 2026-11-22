import type { Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { SecretFinder } from '@heynixie/secret-scan';
import type { IsOwnerTyped } from '../page/secret-scan';
import type { WebFetchConfig } from '../web/web-fetch-defaults';
import type { Computer } from './start-computer';

export interface ComputerToolOptions {
  readonly computer: Computer;

  // the log whose writer holds the stored pages and the files an export leaves
  readonly log: Pick<Log, 'writer'>;

  // the scan that refuses a URL that holds a secret
  readonly findSecret: SecretFinder;
  readonly isOwnerTyped: IsOwnerTyped;
  readonly logger: Logger;

  // the ranges the deployment lists as internal
  readonly deniedRanges: readonly string[];
  readonly fetch: Pick<
    WebFetchConfig,
    'limits' | 'linkPathChars' | 'pageStoreBytes' | 'imageLongEdge' | 'secretTypedURLCovers'
  >;
}
