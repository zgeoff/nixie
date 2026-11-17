import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { pickRaiseResend } from '../raise/pick-raise-resend';
import type { SpendFacts } from '../stop/pick-spend-stop';
import { readSpendFacts } from '../stop/read-spend-facts';
import { settleSpendStop } from '../stop/settle-spend-stop';
import type { GatewayLimits, GatewayStatus, SpendContext } from '../types';

export interface SpendWatcherOptions {
  readonly context: SpendContext;

  // the day and month limits that the gateway has to hold
  readonly limits: GatewayLimits;
  readonly log: Logger;
  readonly signal: AbortSignal;

  // the start checks found no answer from the gateway, so the limits are unsent and the first poll
  // that finds no answer trips the stop at once
  readonly isStartUnreachable: boolean;

  readonly intervalMs?: number;
  readonly noAnswerMs?: number;
}

export interface SpendWatcher {
  readonly stop: () => Promise<void>;
}

const defaultNoAnswerMs = 30_000;

interface WatchState {
  // when the gateway last stopped answering, or 0 for a gateway that never has
  noAnswerSince: number | null;
  isLimitsPending: boolean;
}

// Reads the gateway's status and the turn count every 10 seconds, and trips or clears the stop.
export function startSpendWatcher(options: SpendWatcherOptions): SpendWatcher {
  const state: WatchState = {
    noAnswerSince: options.isStartUnreachable ? 0 : null,
    isLimitsPending: options.isStartUnreachable,
  };

  const loop = runWatchLoop(options, state);

  return { stop: () => loop };
}

const defaultIntervalMs = 10_000;

async function runWatchLoop(options: SpendWatcherOptions, state: WatchState): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await runSpendPoll(options, state);
    } catch (error) {
      options.log('spend.watch_failed', toErrorFields(error), 'error');
    }

    await options.context.clock.sleep(options.intervalMs ?? defaultIntervalMs, options.signal);
  }
}

export async function runSpendPoll(options: SpendWatcherOptions, state: WatchState): Promise<void> {
  const context = options.context;

  const read = await readAnsweredFacts(options);

  const facts =
    read.status === null
      ? read
      : await sendWhatIsMissing(options, state, { ...read, status: read.status });

  if (facts.status === null) {
    state.noAnswerSince ??= facts.now;

    if (facts.now - state.noAnswerSince >= (options.noAnswerMs ?? defaultNoAnswerMs)) {
      await settleSpendStop(context, facts);
    }

    return;
  }

  state.noAnswerSince = null;

  await settleSpendStop(context, facts);
}

// A gateway that counts its periods in another zone resets them at another midnight, so its answer
// is no answer: nixie sends it nothing and the stop stands until the zones are equal.
async function readAnsweredFacts(options: SpendWatcherOptions): Promise<SpendFacts> {
  const facts = await readSpendFacts(options.context);

  if (facts.status === null || facts.status.zone === options.context.zone) {
    return facts;
  }

  options.log(
    'spend.zone_mismatch',
    { gatewayZone: facts.status.zone, defaultZone: options.context.zone },
    'error',
  );

  return { ...facts, status: null };
}

// The limits go out once the gateway answers, and a raise that it has not applied goes out again.
// The status that it answers with replaces the one read, so the stop clears in the same poll. A
// gateway that holds no limits after a failed send counts as no answer, so the stop stands.
async function sendWhatIsMissing(
  options: SpendWatcherOptions,
  state: WatchState,
  facts: SpendFacts & { readonly status: GatewayStatus },
): Promise<SpendFacts> {
  const gateway = options.context.gateway;
  const periods = facts.status.periods;

  const status = {
    current: facts.status,
  };

  if (state.isLimitsPending || periods.day.limit === null || periods.month.limit === null) {
    const put = await gateway.putLimits(options.limits);

    if (put.kind === 'ok') {
      state.isLimitsPending = false;
      status.current = put.value;

      options.log('spend.limits_sent', {}, 'info');
    } else if (put.kind === 'above_cap') {
      options.log(
        'spend.limits_refused',
        { capDollars: put.cap.dollars, capTokens: put.cap.tokens },
        'error',
      );
    }

    if (put.kind !== 'ok') {
      return { ...facts, status: null };
    }
  }

  const resend = pickRaiseResend({ ...facts, status: status.current }, options.context.zone);

  if (resend !== null) {
    const raised = await gateway.postRaise(resend);

    if (raised.kind === 'ok') {
      status.current = raised.value;
    }
  }

  return { ...facts, status: status.current };
}
