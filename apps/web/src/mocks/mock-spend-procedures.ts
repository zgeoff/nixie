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

    if (input.turns !== undefined && input.turns > stop.cap) {
      return { error: 'above_cap', measure: 'turns', route: null, cap: stop.cap };
    }

    await spendStore.raises.create(input);

    spendStore.stops.clear();

    return { state: 'clear' };
  }),
};
