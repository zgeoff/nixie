import type { StatusStep } from './collect-status-events';

// true for a step that ends a break: a return to `active`, or a renewal whose new grant, though
// within its window, works.
export function isBreakEnd(step: StatusStep): boolean {
  return (
    step.step.kind === 'active' || (step.step.kind === 'expiring' && step.step.renewed === true)
  );
}
