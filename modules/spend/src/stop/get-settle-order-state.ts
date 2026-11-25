import type { SpendContext } from '../types';

interface SettleOrderState {
  // the order of the last facts read
  taken: number;

  // the order of the newest facts that a settle used
  settled: number;
}

const states = new WeakMap<object, SettleOrderState>();

// The order counters of the log that the context writes to.
export function getSettleOrderState(context: SpendContext): SettleOrderState {
  const held = states.get(context.log.writer);

  if (held !== undefined) {
    return held;
  }

  const created = { taken: 0, settled: 0 };

  states.set(context.log.writer, created);

  return created;
}
