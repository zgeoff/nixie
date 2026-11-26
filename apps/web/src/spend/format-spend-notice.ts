import { match } from 'ts-pattern';
import type { SpendRouteTrip, SpendStop } from '../types';
import { formatSpendAmount } from './format-spend-amount';
import type { SpendDisplay } from './format-spend-amount';

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
      const limit = `${trip.limit.toLocaleString()} turns`;

      const cap = trip.canRaise
        ? ''
        : " Today's limit is at its cap, so only an operator raises it.";

      return `Model spending stopped: the daily limit of ${limit} was reached at ${reached}. All tasks are paused where they were. Nothing is lost.${cap} Resumes on its own at midnight.`;
    })
    .with({ state: 'tripped', period: 'month' }, (trip) => {
      const reset = trip.resetsAt.toLocaleDateString(undefined, dateFormat);
      const limit = `${trip.limit.toLocaleString()} turns`;

      return `Model spending stopped: the monthly limit of ${limit} was reached. All tasks are paused where they were. Nothing is lost. Resumes on its own on ${reset}, when the month resets.`;
    })
    .exhaustive();
}

// The notice of a route at its limit, with the limit in US dollars and its approximate amount in the
// display currency.
export function formatRouteNotice(trip: SpendRouteTrip, display: SpendDisplay | null): string {
  const period = trip.period === 'day' ? 'daily' : 'monthly';

  const reset =
    trip.period === 'day'
      ? 'at midnight'
      : `on ${trip.resetsAt.toLocaleDateString(undefined, dateFormat)}`;

  return `Model spending paused on ${trip.route}: its ${period} limit of ${formatSpendAmount(trip.limit, display)} was reached. Work on that route waits and nothing is lost. Other routes go on. It resumes on its own ${reset}.`;
}
