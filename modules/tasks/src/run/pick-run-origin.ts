import { match } from 'ts-pattern';
import { isBriefRecord } from '../brief/is-brief-record';
import type { WakeRecord } from '../step/build-step-wake';
import type { WakeSource } from '../step/pick-wake-source';
import type { RunOrigin } from './run-origin';

// The brief opens a task run as start, and any other waking input follows the cause that gave the
// step its wake.
export function pickRunOrigin(source: WakeSource<WakeRecord & { readonly sequence: number }>): {
  readonly kind: RunOrigin;
  readonly sequence: number;
} {
  const kind = match(source.wake.cause)
    .returnType<RunOrigin>()
    .with({ kind: 'owner' }, () => 'owner')
    .with({ kind: 'timer' }, () => 'timer')
    .with({ kind: 'event' }, () => 'event')
    .with({ kind: 'carried' }, () => 'unknown')
    .with({ kind: 'task' }, () => (isBriefRecord(source.record) ? 'start' : 'message'))
    .exhaustive();

  return { kind, sequence: source.record.sequence };
}
