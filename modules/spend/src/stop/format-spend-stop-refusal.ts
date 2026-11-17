import type { SpendStop } from '../types';

// The message of a Resume that the stop refuses: how the stop clears.
export function formatSpendStopRefusal(
  stop: Exclude<SpendStop, { readonly state: 'clear' }>,
): string {
  if (stop.state === 'unreachable') {
    return 'Model spending is stopped because the spending gateway does not answer. nixie resumes when it answers.';
  }

  if (stop.state === 'lost') {
    return 'Model spending is stopped because the spending gateway lost count. nixie resumes when an operator removes the lost mark.';
  }

  const resets = new Date(stop.resetsAt).toISOString();

  return stop.period === 'day'
    ? `Model spending is stopped at the daily limit. nixie resumes at the reset (${resets}), or when you raise today's limit.`
    : `Model spending is stopped at the monthly limit. nixie resumes at the reset (${resets}), or when the deployment raises the month's limit.`;
}
