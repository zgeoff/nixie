import { buildPendingInput } from '../build-pending-input';
import { buildSpanState } from '../build-span-state';
import type { PendingInput, SpanState } from '../types';

export type RecordedInputEvent =
  | {
      readonly event: 'beforeinput';
      readonly inputType: string;
      readonly data: string | null;
      readonly selection: readonly [number, number];
    }
  | { readonly event: 'input'; readonly value: string };

interface Replay {
  readonly pending: PendingInput | undefined;
  readonly state: SpanState;
}

export function buildSpanStateFromEvents(events: readonly RecordedInputEvent[]): SpanState {
  return events.reduce<Replay>(
    (replay, entry) =>
      entry.event === 'beforeinput'
        ? {
            pending: buildPendingInput({
              data: entry.data,
              inputType: entry.inputType,
              selectionEnd: entry.selection[1],
              selectionStart: entry.selection[0],
            }),
            state: replay.state,
          }
        : { pending: undefined, state: buildSpanState(replay.state, replay.pending, entry.value) },
    { pending: undefined, state: { spans: [], text: '' } },
  ).state;
}
