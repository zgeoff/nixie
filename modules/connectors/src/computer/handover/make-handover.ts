import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { AskResult, CancelResult, Handover, HandoverRecords } from './types';

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
  const open: OpenAsk = { askedAtMs, expiry: new AbortController() };

  state.open = open;
  void expireAsk(dependencies, state, open);
}

async function expireAsk(
  dependencies: HandoverDependencies,
  state: HandoverState,
  open: OpenAsk,
): Promise<void> {
  const waitMs = open.askedAtMs + dependencies.expiryMs - dependencies.clock.now();

  if (waitMs > 0) {
    await dependencies.clock.sleep(waitMs, open.expiry.signal);
  }

  if (open.expiry.signal.aborted || state.open !== open) {
    return;
  }

  state.open = null;

  try {
    await dependencies.records.writeClosed({
      by: 'expired',
      waitedSeconds: toSeconds(dependencies.clock.now() - open.askedAtMs),
    });
  } catch (error) {
    dependencies.logger('computer.handover_expiry_failed', { reason: String(error) }, 'error');
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

  closeSilently(state);

  await dependencies.records.writeClosed({
    by: 'assistant',
    waitedSeconds: toSeconds(dependencies.clock.now() - open.askedAtMs),
  });

  return { kind: 'cancelled' };
}
