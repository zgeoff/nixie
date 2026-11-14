import type { ExecStream } from '@heynixie/sandbox';
import type { FetchReply } from '@heynixie/wire';
import { decodeFetchGuestFrame, encodeFetchMessage } from '@heynixie/wire';
import type { TimeLimit } from './wait-or-time-out';
import { waitOrTimeOut } from './wait-or-time-out';

export interface PageHop {
  // 1 for the first redirect
  readonly number: number;
  readonly url: string;

  // the host of the URL before this one, which the server tracks itself; the guest never sends it
  readonly sentBy: string;
}

export type HopVerdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'refuse'; readonly reason: string };

export type HopScan = (hop: PageHop) => Promise<HopVerdict>;

interface PageHopGate {
  readonly sentURL: string;
  readonly redirects: number;
  readonly scanHop: HopScan;
  readonly limit: TimeLimit;
}

// Reads the frames of one gated fetch, one at a time, and scans each hop frame. A refused hop or a
// fault stops the fetcher.
export async function gatePageHops(stream: ExecStream, gate: PageHopGate): Promise<FetchReply> {
  const frames = stream.messages[Symbol.asyncIterator]();

  try {
    return await readFrames(stream, frames, gate);
  } catch (error) {
    await stopQuietly(stream);

    const message = error instanceof Error ? error.message : String(error);

    return { kind: 'failed', reason: `the fetch sandbox failed: ${message}`, isGated: true };
  }
}

async function readFrames(
  stream: ExecStream,
  frames: AsyncIterator<Uint8Array>,
  gate: PageHopGate,
): Promise<FetchReply> {
  const hops = { count: 0, previousURL: gate.sentURL };

  for (;;) {
    const next = await waitOrTimeOut(frames.next(), gate.limit);

    if (next.done === true) {
      throw new Error('the fetcher closed its output with no reply');
    }

    const frame = decodeFetchGuestFrame(next.value);

    if (frame.kind !== 'hop') {
      return finishReply(stream, frame, gate);
    }

    hops.count += 1;

    if (hops.count > gate.redirects) {
      throw new Error(`the fetcher sent more than ${gate.redirects} hop frames`);
    }

    if (!URL.canParse(frame.url)) {
      throw new Error('the fetcher sent a hop whose URL does not parse');
    }

    const hop = { number: hops.count, url: frame.url, sentBy: new URL(hops.previousURL).host };

    const verdict = await scanWithinLimit(gate, hop);

    if (verdict.kind === 'refuse') {
      await stopQuietly(stream);

      return { kind: 'refused', reason: verdict.reason, isGated: true };
    }

    await waitOrTimeOut(stream.send(encodeFetchMessage({ kind: 'hop-pass' })), gate.limit);

    hops.previousURL = frame.url;
  }
}

async function finishReply(
  stream: ExecStream,
  reply: FetchReply,
  gate: PageHopGate,
): Promise<FetchReply> {
  const exit = await waitOrTimeOut(stream.exit, gate.limit);

  if (exit.code !== 0) {
    throw new Error(`the fetcher exited with ${exit.code ?? exit.signal ?? 'no code'}`);
  }

  if (reply.kind === 'failed' && !reply.isGated && gate.redirects > 0) {
    const olderImageReason =
      'the fetch image is of a release before the server and cannot ask before a redirect';

    return { ...reply, reason: `${olderImageReason}: ${reply.reason}` };
  }

  return reply;
}

async function scanWithinLimit(gate: PageHopGate, hop: PageHop): Promise<HopVerdict> {
  try {
    return await waitOrTimeOut(gate.scanHop(hop), gate.limit);
  } catch (error) {
    if (gate.limit.deadline <= gate.limit.clock.now()) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`the hop scan failed: ${message}`, { cause: error });
  }
}

async function stopQuietly(stream: ExecStream): Promise<void> {
  try {
    await stream.stop();
  } catch {
    // the fetch already has its reply, and a stop that fails leaves the sandbox to its destroy
  }
}
