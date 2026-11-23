import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { AskResult, CancelResult, Handover, HandoverClose, HandoverRecords } from './types';

export interface HandoverDependencies {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly records: HandoverRecords;

  // how long an ask stands with no take-over before it expires
  readonly expiryMs: number;

  // true from the moment a take-over is called until the hold ends
  readonly isHeld: () => boolean;
}

interface OpenAsk {
  readonly askedAtMs: number;
  readonly expiry: AbortController;

  // the write of the record that closes the ask, while one is in flight
  closing: Promise<void> | null;
}

interface HandoverState {
  open: OpenAsk | null;
}

// The ask for a take-over: one is open at a time, and it closes when a hold starts, when the
// assistant cancels it, or when it expires.
export function makeHandover(dependencies: HandoverDependencies): Handover {
  const state: HandoverState = { open: null };

  return {
    ask: (reason) => writeAsk(dependencies, state, reason),
    cancel: () => cancelAsk(dependencies, state),
    answer: () => {
      closeSilently(state);
    },
    resume: (askedAtMs) => {
      if (state.open === null) {
        openAsk(dependencies, state, askedAtMs);
      }
    },
    stop: () => {
      closeSilently(state);
    },
  };
}

async function writeAsk(
  dependencies: HandoverDependencies,
  state: HandoverState,
  reason: string,
): Promise<AskResult> {
  if (dependencies.isHeld()) {
    return { kind: 'taken_over' };
  }

  if (state.open !== null) {
    return { kind: 'already_asked' };
  }

  // the ask is open before its record is written, so a second call that arrives meanwhile is refused
  openAsk(dependencies, state, dependencies.clock.now());

  try {
    await dependencies.records.writeAsked({ reason });
  } catch (error) {
    closeSilently(state);
    throw error;
  }

  return { kind: 'asked' };
}

function openAsk(
  dependencies: HandoverDependencies,
  state: HandoverState,
  askedAtMs: number,
): void {
  const open: OpenAsk = { askedAtMs, expiry: new AbortController(), closing: null };

  state.open = open;
  void expireAsk(dependencies, state, open);
}

// how long a failed expiry waits before it writes its record again
const retryMs = 60_000;

async function expireAsk(
  dependencies: HandoverDependencies,
  state: HandoverState,
  open: OpenAsk,
): Promise<void> {
  const waitMs = open.askedAtMs + dependencies.expiryMs - dependencies.clock.now();

  if (waitMs > 0) {
    await dependencies.clock.sleep(waitMs, open.expiry.signal);
  }

  while (!open.expiry.signal.aborted && state.open === open) {
    // a take-over that was called before the deadline answers the ask, so the ask waits for its end
    if (!dependencies.isHeld()) {
      try {
        await closeOpen(dependencies, state, open, 'expired');

        return;
      } catch (error) {
        dependencies.logger('computer.handover_expiry_failed', { reason: String(error) }, 'error');
      }
    }

    await dependencies.clock.sleep(retryMs, open.expiry.signal);
  }
}

// Writes the record that closes the open ask, and forgets the ask only once the record is written,
// so a failed write leaves the ask open for a retry.
async function closeOpen(
  dependencies: HandoverDependencies,
  state: HandoverState,
  open: OpenAsk,
  by: HandoverClose,
): Promise<void> {
  open.closing ??= writeClose(dependencies, open, by);

  await open.closing;

  if (state.open === open) {
    closeSilently(state);
  }
}

async function writeClose(
  dependencies: HandoverDependencies,
  open: OpenAsk,
  by: HandoverClose,
): Promise<void> {
  try {
    await dependencies.records.writeClosed({
      by,
      waitedSeconds: toSeconds(dependencies.clock.now() - open.askedAtMs),
    });
  } finally {
    open.closing = null;
  }
}

function toSeconds(durationMs: number): number {
  return Math.round(durationMs / 1000);
}

function closeSilently(state: HandoverState): void {
  state.open?.expiry.abort();
  state.open = null;
}

async function cancelAsk(
  dependencies: HandoverDependencies,
  state: HandoverState,
): Promise<CancelResult> {
  const open = state.open;

  if (open === null) {
    return { kind: 'not_asked' };
  }

  await closeOpen(dependencies, state, open, 'assistant');

  return { kind: 'cancelled' };
}
