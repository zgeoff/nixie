import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { ExecStream } from '@heynixie/sandbox';
import type { ComputerHopFrame, ComputerReply, VNCFrame } from '@heynixie/wire';
import {
  decodeComputerGuestFrame,
  decodeVNCFrame,
  encodeComputerMessage,
  encodeVNCFrame,
  vncChunkLimitBytes,
} from '@heynixie/wire';
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

// what a VNC stream's owner hears from the guest
interface VNCStreamListener {
  readonly onData: (bytes: Uint8Array) => void;

  // the guest closed the stream, or the guest ended
  readonly onClose: () => void;
}

export interface VNCStream {
  readonly send: (bytes: Uint8Array) => Promise<void>;

  // closes the stream and tells the guest, and the listener hears nothing more
  readonly close: () => void;
}

export interface GuestSession {
  // Opens a VNC stream to the guest. The guest answers with data, or with a close when its VNC
  // server refuses. A stream runs beside the guest's calls and never takes the turn.
  readonly openStream: (listener: VNCStreamListener) => VNCStream;

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

  const streams = new Map<string, VNCStreamListener>();

  void pumpFrames(options, active, streams);

  return {
    stream: options.stream,
    openStream: (listener) => openStream(options, streams, listener),
    exchange: (call) => exchange(options, active, call),
  };
}

async function pumpFrames(
  options: GuestSessionOptions,
  active: ActiveRef,
  streams: Map<string, VNCStreamListener>,
): Promise<void> {
  try {
    for await (const bytes of options.stream.messages) {
      const vncFrame = decodeVNCFrame(bytes);

      if (vncFrame !== null) {
        routeStreamFrame(streams, vncFrame);
        continue;
      }

      const frame = decodeComputerGuestFrame(bytes);

      if (frame.kind === 'hop' || frame.kind === 'hop-content') {
        await answerHop(options, active.current, frame);
      } else {
        const running = active.current;

        running?.reply.resolve({ kind: 'reply', reply: frame, refusal: running.refusal });
      }
    }

    closeStreams(streams);

    active.current?.reply.resolve({
      kind: 'broken',
      message: 'the guest closed its output with no reply',
    });
  } catch (error) {
    closeStreams(streams);

    active.current?.reply.resolve({
      kind: 'broken',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// A frame for a stream that is not open, such as a late one after a close, is dropped.
function routeStreamFrame(streams: Map<string, VNCStreamListener>, frame: VNCFrame): void {
  const listener = streams.get(frame.stream);

  if (listener === undefined) {
    return;
  }

  if (frame.kind === 'vnc-data') {
    listener.onData(frame.data);
  } else if (frame.kind === 'vnc-close') {
    streams.delete(frame.stream);
    listener.onClose();
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

function closeStreams(streams: Map<string, VNCStreamListener>): void {
  const closing = [...streams.values()];

  streams.clear();

  for (const listener of closing) {
    listener.onClose();
  }
}

function openStream(
  options: GuestSessionOptions,
  streams: Map<string, VNCStreamListener>,
  listener: VNCStreamListener,
): VNCStream {
  const id = crypto.randomUUID();

  streams.set(id, listener);

  const sendFrame = (frame: Parameters<typeof encodeVNCFrame>[0]): Promise<void> =>
    options.stream.send(encodeVNCFrame(frame));

  void sendOpen(sendFrame({ kind: 'vnc-open', stream: id }), options.logger, () => {
    if (streams.delete(id)) {
      listener.onClose();
    }
  });

  return {
    send: async (bytes) => {
      for (let start = 0; start < bytes.byteLength; start += vncChunkLimitBytes) {
        const data = new Uint8Array(bytes.subarray(start, start + vncChunkLimitBytes));

        await sendFrame({ kind: 'vnc-data', stream: id, data });
      }
    },
    close: () => {
      if (streams.delete(id)) {
        void sendQuietly(sendFrame({ kind: 'vnc-close', stream: id }), options.logger);
      }
    },
  };
}

// A stream the guest never heard of can carry nothing, so a failed open ends it for its owner.
async function sendOpen(
  sending: Promise<void>,
  logger: Logger,
  onFailure: () => void,
): Promise<void> {
  try {
    await sending;
  } catch (error) {
    logger('computer.vnc_send_failed', { reason: String(error) }, 'warn');
    onFailure();
  }
}

async function sendQuietly(sending: Promise<void>, logger: Logger): Promise<void> {
  try {
    await sending;
  } catch (error) {
    logger('computer.vnc_send_failed', { reason: String(error) }, 'warn');
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
