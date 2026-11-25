import type { Log } from '@heynixie/log';
import { readLayout } from '../layout/read-layout';
import type { DeviceStreams } from '../stream/create-device-streams';

export interface PageDataRequest {
  readonly region: string;
  readonly shown: string;
  readonly url: string;
}

export interface PageDataSource {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly streams: Pick<DeviceStreams, 'fetches'>;
  readonly nowMs: number;
}

export type PageDataRead =
  | { readonly status: 'stale' }
  | { readonly status: 'not_declared' }
  | { readonly status: 'not_ready' }
  | { readonly status: 'refused' }
  | {
      readonly status: 'ok';
      readonly response: {
        readonly status: number;
        readonly type: string;
        readonly body: string;
        readonly fetchedAtMs: number;
      };
    };

// What a page's nixie.data gets for a URL: the last response of the fetch the page declared, or why
// there is none. The layout decides whether the call is current and which URLs the page declared,
// so a page that was replaced reads nothing of the page after it.
export async function readPageData(
  source: PageDataSource,
  deviceID: string,
  request: PageDataRequest,
): Promise<PageDataRead> {
  const layout = await readLayout(source.log, deviceID, source.nowMs);

  const region = layout?.regions.find((candidate) => candidate.name === request.region);

  if (region?.shown?.shownID !== request.shown) {
    return { status: 'stale' };
  }

  const content = region.shown.content;

  const isDeclared =
    content.kind === 'html' && content.fetches?.some((fetch) => fetch.url === request.url) === true;

  if (!isDeclared) {
    return { status: 'not_declared' };
  }

  const read = source.streams.fetches.read({ deviceID, ...request });

  // the layout says the page is current, so a held declaration of other content or none is one that
  // the runner has not registered yet
  if (read.status !== 'done') {
    return { status: 'not_ready' };
  }

  if (read.result.kind === 'refused') {
    return { status: 'refused' };
  }

  return {
    status: 'ok',
    response: {
      status: read.result.status,
      type: read.result.type,
      body: read.result.body,
      fetchedAtMs: read.result.fetchedAtMs,
    },
  };
}
