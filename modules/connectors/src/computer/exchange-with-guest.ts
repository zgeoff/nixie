import type { Clock } from '@heynixie/clock';
import type { ExecStream } from '@heynixie/sandbox';
import type { ComputerReply } from '@heynixie/wire';
import { decodeComputerGuestFrame, encodeComputerMessage } from '@heynixie/wire';
import type { TimeLimit } from '../utils/wait-or-time-out';
import { waitOrTimeOut } from '../utils/wait-or-time-out';
import type { ComputerCall } from './types';

export interface GuestProcess {
  readonly stream: ExecStream;
  readonly frames: AsyncIterator<Uint8Array>;
}

export type ExchangeResult =
  | { readonly kind: 'reply'; readonly reply: ComputerReply; readonly refusal: string | null }
  | { readonly kind: 'broken'; readonly message: string };

// Sends one request and reads frames until the reply. A hop frame goes to the call's scan of URLs or of text, and the
// guest hears pass or refuse before it goes on. A guest that exits, sends nonsense or passes the
// call's time limit leaves the exchange broken, and the caller stops it.
export async function exchangeWithGuest(
  guest: GuestProcess,
  call: ComputerCall,
  clock: Clock,
): Promise<ExchangeResult> {
  const limit: TimeLimit = {
    clock,
    deadline: clock.now() + call.timeoutMs,
    message: 'the guest passed its time limit',
  };

  try {
    await waitOrTimeOut(guest.stream.send(encodeComputerMessage(call.request)), limit);

    return await readUntilReply(guest, call, limit);
  } catch (error) {
    return { kind: 'broken', message: error instanceof Error ? error.message : String(error) };
  }
}

async function readUntilReply(
  guest: GuestProcess,
  call: ComputerCall,
  limit: TimeLimit,
): Promise<ExchangeResult> {
  let refusal: string | null = null;

  for (;;) {
    const next = await waitOrTimeOut(guest.frames.next(), limit);

    if (next.done === true) {
      return { kind: 'broken', message: 'the guest closed its output with no reply' };
    }

    const frame = decodeComputerGuestFrame(next.value);

    if (frame.kind !== 'hop' && frame.kind !== 'hop-content') {
      return { kind: 'reply', reply: frame, refusal };
    }

    const scanning = frame.kind === 'hop' ? call.scan(frame.url) : call.scanText(frame.text);

    const verdict = await waitOrTimeOut(scanning, limit);

    if (verdict.kind === 'refuse') {
      refusal = verdict.reason;
    }

    const answer =
      verdict.kind === 'pass'
        ? encodeComputerMessage({ kind: 'hop-pass' })
        : encodeComputerMessage({ kind: 'hop-refuse', reason: verdict.reason });

    await waitOrTimeOut(guest.stream.send(answer), limit);
  }
}
