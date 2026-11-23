import type { Clock } from '@heynixie/clock';
import { labelAfter } from './label-after';

// Waits for the calls ahead, up to the limit. A call that times out leaves its place in the chain,
// which frees when the calls ahead end.
export interface TurnChain {
  // the end of the chain of calls
  turn: Promise<void>;
}

export async function takeTurn(
  state: TurnChain,
  limitMs: number,
  clock: Clock,
): Promise<(() => void) | null> {
  const previous = state.turn;
  const ended = Promise.withResolvers<void>();

  state.turn = ended.promise;

  const gave = new AbortController();

  const outcome = await Promise.race([
    labelAfter(previous, 'turn'),
    labelAfter(clock.sleep(limitMs, gave.signal), 'late'),
  ]);

  gave.abort();

  if (outcome === 'late') {
    void resolveAfter(previous, ended);

    return null;
  }

  return () => {
    ended.resolve();
  };
}

async function resolveAfter(
  waiting: Promise<unknown>,
  ended: PromiseWithResolvers<void>,
): Promise<void> {
  await waiting;

  ended.resolve();
}
