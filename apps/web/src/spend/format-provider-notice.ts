import type { SpendProviderTrip } from '../types';
import { formatSpendAmount } from './format-spend-amount';
import type { SpendDisplay } from './format-spend-amount';

const dateFormat: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

// The notice of a provider at its limit. Work on every route of the provider waits, and the notice
// names the provider and its routes.
export function formatProviderNotice(
  trip: SpendProviderTrip,
  display: SpendDisplay | null,
): string {
  const period = trip.period === 'day' ? 'daily' : 'monthly';

  const reset =
    trip.period === 'day'
      ? 'at midnight'
      : `on ${trip.resetsAt.toLocaleDateString(undefined, dateFormat)}`;

  const routes = trip.routes.length === 0 ? '' : ` (${trip.routes.join(', ')})`;

  return `Model spending paused on the provider ${trip.provider}: its ${period} limit of ${formatSpendAmount(trip.limit, display)} was reached. Work on every route of it${routes} waits and nothing is lost. Routes of other providers go on. It resumes on its own ${reset}.`;
}
