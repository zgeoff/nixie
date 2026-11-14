import type { Log } from '@heynixie/log';
import type { ToolImage } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import type { PageSession } from './get-page-session';
import type { PageLimits } from './write-web-fetch-page';

export interface PageFetch {
  readonly log: Pick<Log, 'writer'>;
  readonly readPage: (url: string) => Promise<FetchReply>;
  readonly session: PageSession;
  readonly limits: PageLimits;
  readonly imageLongEdge: number;

  // null when the call cannot show the model an image, such as one under the run's own token
  readonly reserveImages: ((images: readonly ToolImage[]) => boolean) | null;
}
