import { decodeFetchHopPass } from './decode-fetch-hop-pass';
import { encodeFetchMessage } from './encode-fetch-message';
import { encodeFrame } from './encode-frame';

export type AskHop = (url: string, signal: AbortSignal) => Promise<void>;

interface HopAskerIO {
  readonly frames: AsyncIterator<Uint8Array>;
  readonly write: (bytes: Uint8Array) => Promise<void>;
}

// Writes the hop frame, resolves on hop-pass, rejects on an abort, in the write or the wait, or
// when the input closes.
export function makeHopAsker(io: HopAskerIO): AskHop {
  return async (url, signal) => {
    signal.throwIfAborted();

    const frame = encodeFrame(encodeFetchMessage({ kind: 'hop', url }));

    await raceAbort(io.write(frame), signal);

    const next = await raceAbort(io.frames.next(), signal);

    if (next.done === true) {
      throw new Error('the input closed before the server answered a hop');
    }

    decodeFetchHopPass(next.value);
  };
}

async function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();

  const aborted = Promise.withResolvers<never>();

  const onAbort = (): void => {
    aborted.reject(signal.reason);
  };

  signal.addEventListener('abort', onAbort, { once: true });

  try {
    return await Promise.race([promise, aborted.promise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
