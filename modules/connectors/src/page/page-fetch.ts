import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import type { ToolImage } from '@heynixie/tools';
import type { FetchBackoff } from '../fetch/make-fetch-backoff';
import type { FetchSandbox } from '../fetch/start-fetch-sandbox';
import type { PageSession } from '../utils/get-page-session';
import type { PageLimits } from '../web/write-web-fetch-page';
import type { SecretScanSetup } from './secret-scan';

export interface PageFetch {
  readonly log: Pick<Log, 'writer'>;
  readonly readPage: FetchSandbox['readPage'];

  // what the secret scan of this call needs
  readonly secretScan: SecretScanSetup;
  readonly session: PageSession;
  readonly limits: PageLimits;
  readonly imageLongEdge: number;
  readonly backoff: FetchBackoff;

  // the longest pause a call waits out itself
  readonly backoffWaitMs: number;
  readonly clock: Clock;

  // null when the call cannot show the model an image, such as one under the run's own token
  readonly reserveImages: ((images: readonly ToolImage[]) => boolean) | null;
}
