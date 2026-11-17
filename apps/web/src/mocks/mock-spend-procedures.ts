import type { SpendRaiseOutput } from '../types';
import { mockImplementer } from './mock-implementer';
import { readMockSpendStop } from './read-mock-spend-stop';
import { requireMockSession } from './require-mock-session';
import { spendStore } from './spend-store';

const os = mockImplementer;

export const mockSpendProcedures = {
  read: os.spend.read.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockSpendStop();
  }),

  raise: os.spend.raise.handler(async (options): Promise<SpendRaiseOutput> => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const stop = readMockSpendStop();
    const input = options.input;

    if (stop.state === 'clear') {
      return { state: 'clear' };
    }

    if (stop.state !== 'tripped') {
      return { state: 'stopped' };
    }

    if (input.start !== stop.start) {
      return { error: 'period_ended' };
    }

    const isAbove =
      input.dollars > stop.cap.dollars ||
      input.tokens > stop.cap.tokens ||
      input.turns > stop.cap.turns;

    if (isAbove) {
      return { error: 'above_cap', cap: stop.cap };
    }

    await spendStore.raises.create(input);

    spendStore.stops.clear();

    return { state: 'clear' };
  }),
};
