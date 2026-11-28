import type { DirectResult, PrepareRefusal, Prepared } from '../types';

export function isPrepareRefusal(
  value: Prepared | DirectResult | PrepareRefusal,
): value is PrepareRefusal {
  return 'status' in value && value.status === 'error';
}
