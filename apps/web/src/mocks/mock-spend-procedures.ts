import type { SpendRaiseInput, SpendRaiseOutput, SpendSetCountOutput } from '../types';
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

  counts: os.spend.counts.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const held = spendStore.counts.all().findLast(() => true);

    return held === undefined ? { providers: [], routes: [], display: null } : held.counts;
  }),

  setCount: os.spend.setCount.handler(async (options): Promise<SpendSetCountOutput> => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    await spendStore.countSets.create(options.input);

    spendStore.stops.clear();

    return { state: 'clear' };
  }),

  raise: os.spend.raise.handler(async (options): Promise<SpendRaiseOutput> => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const stop = readMockSpendStop();
    const input = options.input;

    if (input.provider !== undefined) {
      return raiseMockProvider(stop, input, input.provider);
    }

    if (input.route !== undefined) {
      return raiseMockRoute(stop, input, input.route);
    }

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
      return { error: 'above_cap', measure: 'turns', route: null, provider: null, cap: stop.cap };
    }

    await spendStore.raises.create(input);

    spendStore.stops.clear();

    return { state: 'clear' };
  }),
};

async function raiseMockProvider(
  stop: ReturnType<typeof readMockSpendStop>,
  input: SpendRaiseInput,
  provider: string,
): Promise<SpendRaiseOutput> {
  const trip = stop.providers.find((candidate) => candidate.provider === provider);

  if (trip === undefined) {
    return { error: 'unknown_provider' };
  }

  if (input.start !== trip.start) {
    return { error: 'period_ended' };
  }

  if (input.dollars !== undefined && input.dollars > (trip.cap ?? trip.limit)) {
    return {
      error: 'above_cap',
      measure: 'dollars',
      route: null,
      provider,
      cap: trip.cap ?? trip.limit,
    };
  }

  await spendStore.raises.create(input);

  spendStore.stops.clear();

  return { state: 'clear' };
}

async function raiseMockRoute(
  stop: ReturnType<typeof readMockSpendStop>,
  input: SpendRaiseInput,
  route: string,
): Promise<SpendRaiseOutput> {
  const trip = stop.routes.find((candidate) => candidate.route === route);

  if (trip === undefined) {
    return { error: 'unknown_route' };
  }

  if (input.start !== trip.start) {
    return { error: 'period_ended' };
  }

  if (input.dollars !== undefined && input.dollars > (trip.cap ?? trip.limit)) {
    return {
      error: 'above_cap',
      measure: 'dollars',
      route,
      provider: null,
      cap: trip.cap ?? trip.limit,
    };
  }

  // a route named for what the gateway does to its raise, so a test reaches each refusal
  if (route === 'no-status') {
    return { error: 'unreachable' };
  }

  await spendStore.raises.create(input);

  if (route === 'unanswered') {
    return { error: 'unanswered' };
  }

  spendStore.stops.clear();

  return { state: 'clear' };
}
