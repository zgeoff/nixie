import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { ExecStream } from '@heynixie/sandbox';
import type { ComputerHopFrame, ComputerReply } from '@heynixie/wire';
import { decodeComputerGuestFrame, encodeComputerMessage } from '@heynixie/wire';
import type { TimeLimit } from '../utils/wait-or-time-out';
import { waitOrTimeOut } from '../utils/wait-or-time-out';
import type { ComputerCall, ComputerScan, ScanVerdict } from './types';

// the scans of a request that no call made, which carry no typed URL to exempt
export interface OutOfCallScans {
  readonly scan: ComputerScan;
  readonly scanText: ComputerScan;
}

type ExchangeResult =
  | { readonly kind: 'reply'; readonly reply: ComputerReply; readonly refusal: string | null }
  | { readonly kind: 'broken'; readonly message: string };

export interface GuestSession {
  // Sends one request and waits for its reply. A guest that exits, sends nonsense or passes the
  // call's time limit leaves the exchange broken, and the caller stops the guest.
  readonly exchange: (call: ComputerCall) => Promise<ExchangeResult>;
  readonly stream: ExecStream;
}

export interface GuestSessionOptions {
  readonly stream: ExecStream;
  readonly scans: OutOfCallScans;
  readonly clock: Clock;
  readonly logger: Logger;
}

interface ActiveCall {
  readonly call: ComputerCall;
  readonly reply: PromiseWithResolvers<ExchangeResult>;
  refusal: string | null;
}

interface ActiveRef {
  current: ActiveCall | null;
}

// Reads the guest's frames for as long as the guest lives. A hop frame is a request about to leave.
// The running call's scans answer a hop during a call. Any other hop is scanned with no typed URL
// to exempt it, and a refusal writes no record: the request fails in the page.
export function makeGuestSession(options: GuestSessionOptions): GuestSession {
  const active: ActiveRef = { current: null };

  void pumpFrames(options, active);

  return {
    stream: options.stream,
    exchange: (call) => exchange(options, active, call),
  };
}

async function pumpFrames(options: GuestSessionOptions, active: ActiveRef): Promise<void> {
  try {
    for await (const bytes of options.stream.messages) {
      const frame = decodeComputerGuestFrame(bytes);

      if (frame.kind === 'hop' || frame.kind === 'hop-content') {
        await answerHop(options, active.current, frame);
      } else {
        const running = active.current;

        running?.reply.resolve({ kind: 'reply', reply: frame, refusal: running.refusal });
      }
    }

    active.current?.reply.resolve({
      kind: 'broken',
      message: 'the guest closed its output with no reply',
    });
  } catch (error) {
    active.current?.reply.resolve({
      kind: 'broken',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function answerHop(
  options: GuestSessionOptions,
  running: ActiveCall | null,
  frame: ComputerHopFrame,
): Promise<void> {
  const scans = running?.call ?? options.scans;

  const verdict = await scanHop(options, scans, frame);

  if (verdict.kind === 'refuse' && running !== null) {
    running.refusal = verdict.reason;
  }

  const answer =
    verdict.kind === 'pass'
      ? { kind: 'hop-pass' as const }
      : { kind: 'hop-refuse' as const, reason: verdict.reason };

  await options.stream.send(encodeComputerMessage(answer));
}

// A scan that fails leaves its request refused, so a broken scan never lets a request through.
async function scanHop(
  options: GuestSessionOptions,
  scans: OutOfCallScans,
  frame: ComputerHopFrame,
): Promise<ScanVerdict> {
  try {
    return await (frame.kind === 'hop' ? scans.scan(frame.url) : scans.scanText(frame.text));
  } catch (error) {
    options.logger('computer.scan_failed', { reason: String(error) }, 'warn');

    return { kind: 'refuse', reason: 'the request could not be scanned, so it was not sent' };
  }
}

async function exchange(
  options: GuestSessionOptions,
  active: ActiveRef,
  call: ComputerCall,
): Promise<ExchangeResult> {
  const limit: TimeLimit = {
    clock: options.clock,
    deadline: options.clock.now() + call.timeoutMs,
    message: 'the guest passed its time limit',
  };

  const running: ActiveCall = { call, reply: Promise.withResolvers(), refusal: null };

  active.current = running;

  try {
    await waitOrTimeOut(options.stream.send(encodeComputerMessage(call.request)), limit);

    return await waitOrTimeOut(running.reply.promise, limit);
  } catch (error) {
    return { kind: 'broken', message: error instanceof Error ? error.message : String(error) };
  } finally {
    active.current = null;
  }
}
