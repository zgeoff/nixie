import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { pickRaiseResend } from '../raise/pick-raise-resend';
import type { SpendFacts } from '../stop/pick-spend-stop';
import { readSpendFacts } from '../stop/read-spend-facts';
import { settleSpendStop } from '../stop/settle-spend-stop';
import type { GatewayStatus, SpendContext } from '../types';
import { publishSpendChange } from './publish-spend-change';

export interface SpendWatcherOptions {
  readonly context: SpendContext;
  readonly log: Logger;
  readonly signal: AbortSignal;

  // the start checks found no answer from the gateway, so the first poll that finds no answer trips
  // the stop at once
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

  // the stop the last poll read, as text, or null before the first poll
  lastStopKey: string | null;
}

// Reads the gateway's status and the turn count every 10 seconds, and trips or clears the stop and
// each route's stop.
export function startSpendWatcher(options: SpendWatcherOptions): SpendWatcher {
  const state: WatchState = {
    noAnswerSince: options.isStartUnreachable ? 0 : null,
    lastStopKey: null,
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
      : await sendWhatIsMissing(options, { ...read, status: read.status });

  publishSpendChange(context, state, facts);

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

// A raise that the gateway has not applied goes out again, and the status that it answers with
// replaces the one read, so the stop clears in the same poll. That status keeps the poll's place in
// line, which it took before the raise went out, and counts from the instant before the raise.
async function sendWhatIsMissing(
  options: SpendWatcherOptions,
  facts: SpendFacts & { readonly status: GatewayStatus },
): Promise<SpendFacts> {
  const context = options.context;
  const resends = pickRaiseResend({ ...facts, status: facts.status }, context.zone);
  let answer: Pick<SpendFacts, 'status' | 'statusAtMs'> | null = null;

  for (const resend of resends) {
    const postedAtMs = context.clock.now();

    const raised = await context.gateway.postRaise(resend);

    if (raised.kind === 'ok') {
      answer = { status: raised.value, statusAtMs: postedAtMs };
    }
  }

  return answer === null ? facts : { ...facts, ...answer };
}
