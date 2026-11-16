import type { RunEndCause } from './run-end-cause';

export type RunEndingTrigger =
  | {
      readonly kind: 'step';

      // a report request in the task run, or a report that the runner returned
      readonly hasReport: boolean;
      readonly limit: { readonly meter: 'turns' | 'dollars' } | null;
      readonly isDone: boolean;
      readonly activity: 'worked' | 'none';
      readonly isFirstStep: boolean;

      // more work queued for the task, or an open wait for a reply or an event
      readonly hasWork: boolean;
      readonly isWakeable: boolean;
    }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'closed' }

  // the claim ends an idle task run of a definition's task to open the task run of a fire
  | { readonly kind: 'claim' }
  | { readonly kind: 'failed' };

export interface RunEnding {
  readonly cause: Exclude<RunEndCause, 'unknown'>;
  readonly limitMeter: 'turns' | 'dollars' | null;
}

// The first row of the ending table that applies, or null when the task run stays open.
export function pickRunEnding(trigger: RunEndingTrigger): RunEnding | null {
  if (trigger.kind === 'claim') {
    return { cause: 'no_report', limitMeter: null };
  }

  if (trigger.kind !== 'step') {
    return { cause: trigger.kind, limitMeter: null };
  }

  if (trigger.hasReport) {
    return { cause: 'reported', limitMeter: null };
  }

  if (trigger.limit !== null) {
    return { cause: 'limit', limitMeter: trigger.limit.meter };
  }

  if (trigger.isDone) {
    return { cause: 'no_report', limitMeter: null };
  }

  if (trigger.isFirstStep && trigger.activity === 'none') {
    return { cause: 'no_work', limitMeter: null };
  }

  if (!trigger.hasWork && !trigger.isWakeable) {
    return { cause: 'no_report', limitMeter: null };
  }

  return null;
}
