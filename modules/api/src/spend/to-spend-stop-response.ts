import type { SpendStop } from '@heynixie/spend';

export function toSpendStopResponse(stop: SpendStop) {
  if (stop.state !== 'tripped') {
    return stop;
  }

  return { ...stop, at: new Date(stop.at), resetsAt: new Date(stop.resetsAt) };
}
