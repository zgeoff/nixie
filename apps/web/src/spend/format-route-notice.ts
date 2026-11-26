import type { SpendRouteTrip } from '../types';
import { formatSpendAmount } from './format-spend-amount';
import type { SpendDisplay } from './format-spend-amount';

const dateFormat: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

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
