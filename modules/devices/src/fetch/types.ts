import type { Clock } from '@heynixie/clock';
import type { RegionContent } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import type { DeviceStreams } from '../stream/create-device-streams';
import type { DeviceFetching } from '../tool/device-tool-options';
import type { ShownRegion } from '../types';

export interface PageFetchesOptions {
  readonly log: Log;
  readonly clock: Clock;
  readonly streams: DeviceStreams;
  readonly fetching: DeviceFetching;
  readonly onFailure: (error: unknown) => void;
}

// What the runner holds of one declared fetch of one page: when it runs next, or null when it runs
// no more, and whether it ran once already.
export interface FetchSchedule {
  nextAtMs: number | null;
  hasRun: boolean;
}

// One declared fetch of a page region that shows now.
export interface FetchTarget {
  readonly deviceID: string;
  readonly region: string;

  // the short ID of the content that declared the fetch
  readonly shown: string;

  // the sequence of the call that showed the content, or null for content from before the call
  // was recorded
  readonly callSequence: number | null;
  readonly url: string;
}

// How a fetch ended: with a response, with a failure that the next refresh may mend, with a refusal
// that ends the refreshes, or with a pause of the host that holds it back.
export type FetchOutcome =
  | { readonly kind: 'fetched' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'paused'; readonly leftMs: number };

// The fetches that the page of one region declares, and the content that declared them.
export interface RegionTarget {
  readonly deviceID: string;
  readonly region: string;
  readonly shown: ShownRegion;
  readonly fetches: NonNullable<Extract<RegionContent, { kind: 'html' }>['fetches']>;
}
