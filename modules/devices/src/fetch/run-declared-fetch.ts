import type { HopVerdict } from '@heynixie/connectors';
import type { FetchOutcome, FetchTarget, PageFetchesOptions } from './types';

// Runs one declared fetch, and keeps what came back for the page. A refusal and a failure are kept
// too, so the page's nixie.data rejects and the preview's errors name them. A fetch asks the rules
// again only when the call that showed the page did not decide it.
export async function runDeclaredFetch(
  options: PageFetchesOptions,
  target: FetchTarget,
  needsCheck: boolean,
): Promise<FetchOutcome> {
  const host = new URL(target.url).host;

  const isAllowed = needsCheck ? await probeHostAllowed(options, target, host) : true;

  if (!isAllowed) {
    reportRefusal(options, target, `the rules no longer allow a fetch of ${host}`);

    return { kind: 'refused' };
  }

  const leftMs = options.fetching.backoff.readPause(host);

  if (leftMs > 0) {
    return { kind: 'paused', leftMs };
  }

  const reply = await options.fetching.readBody(target.url, {
    scanHop: (hop) => Promise.resolve(scanSameHost(hop.url, host)),
  });

  if (reply.kind === 'refused' || reply.kind === 'failed') {
    reportRefusal(options, target, reply.reason);

    return { kind: reply.kind };
  }

  if (reply.kind !== 'body') {
    reportRefusal(options, target, 'the fetcher answered with a reply no fetch asks for');

    return { kind: 'failed' };
  }

  if (reply.status === 429 || reply.status === 503) {
    options.fetching.backoff.setPause(host, reply.retryAfterMs);
  }

  options.streams.fetches.record(target, {
    kind: 'body',
    status: reply.status,
    type: reply.contentType ?? '',
    body: reply.text,
    fetchedAtMs: options.clock.now(),
  });

  options.streams.sendNotice(target.deviceID, {
    region: target.region,
    shown: target.shown,
    url: target.url,
  });

  return { kind: 'fetched' };
}

function probeHostAllowed(
  options: PageFetchesOptions,
  target: FetchTarget,
  host: string,
): Promise<boolean> {
  if (target.callSequence === null) {
    return Promise.resolve(false);
  }

  return options.fetching.checkHosts(target.callSequence, [host]);
}

// Keeps the refusal for the page and for the preview's errors, and tells the page that its fetch
// changed, so a page that waits on nixie.data learns the answer.
function reportRefusal(options: PageFetchesOptions, target: FetchTarget, reason: string): void {
  options.streams.fetches.record(target, { kind: 'refused', reason });

  options.streams.errors.record(target.deviceID, {
    region: target.region,
    shown: target.shown,
    atMs: options.clock.now(),
    message: `the fetch of ${target.url} was refused: ${reason}`,
  });

  options.streams.sendNotice(target.deviceID, {
    region: target.region,
    shown: target.shown,
    url: target.url,
  });
}

function scanSameHost(url: string, host: string): HopVerdict {
  return new URL(url).host === host
    ? { kind: 'pass' }
    : { kind: 'refuse', reason: `the fetch of ${host} redirected to another host` };
}
