import { match } from 'ts-pattern';
import type { SpendStop } from '../types';

const timeFormat: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
};

const dateFormat: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

type StandingStop = Exclude<SpendStop, { readonly state: 'clear' }>;

// The notice of a standing stop. A day trip says that it resumes at midnight, a month trip names
// the date of its reset, and a stop that only an operator clears says so.
export function formatSpendNotice(stop: StandingStop): string {
  return match(stop)
    .with(
      { state: 'unreachable' },
      () =>
        'Model spending stopped: nixie cannot reach the spending gateway. An operator must check the gateway. All tasks are paused where they were, and nothing is lost. nixie resumes when the gateway answers.',
    )
    .with(
      { state: 'lost' },
      () =>
        'Model spending stopped: the spending gateway lost count of what the model cost. An operator must remove the lost mark from the gateway. All tasks are paused where they were, and nothing is lost.',
    )
    .with({ state: 'tripped', period: 'day' }, (trip) => {
      const reached = trip.at.toLocaleTimeString(undefined, timeFormat);
      const limit = formatLimit(trip.measure, trip.limit);

      const cap = trip.canRaise
        ? ''
        : " Today's limit is at its cap, so only an operator raises it.";

      return `Model spending stopped: the daily limit of ${limit} was reached at ${reached}. All tasks are paused where they were. Nothing is lost.${cap} Resumes on its own at midnight.`;
    })
    .with({ state: 'tripped', period: 'month' }, (trip) => {
      const reset = trip.resetsAt.toLocaleDateString(undefined, dateFormat);
      const limit = formatLimit(trip.measure, trip.limit);

      return `Model spending stopped: the monthly limit of ${limit} was reached. All tasks are paused where they were. Nothing is lost. Resumes on its own on ${reset}, when the month resets.`;
    })
    .exhaustive();
}

export function formatLimit(measure: 'dollars' | 'tokens' | 'turns', limit: number): string {
  return match(measure)
    .with('dollars', () => `$${limit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
    .with('tokens', () => `${limit.toLocaleString()} tokens`)
    .with('turns', () => `${limit.toLocaleString()} turns`)
    .exhaustive();
}
