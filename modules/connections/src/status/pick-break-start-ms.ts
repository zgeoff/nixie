import type { StatusStep } from './collect-status-events';

// When a break began: the earliest failing or consent step of the steps after the connection's last
// return to `active`, or null when none came. A consent step the clock took holds the time the grant
// ended, which can come before a failing step that the store wrote first.
export function pickBreakStartMs(current: readonly StatusStep[]): number | null {
  const starts = current
    .filter((step) => step.step.kind === 'failing' || step.step.kind === 'needs_consent')
    .map((step) => step.atMs);

  return starts.length === 0 ? null : Math.min(...starts);
}
