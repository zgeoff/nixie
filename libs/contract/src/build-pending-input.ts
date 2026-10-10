import { pickSpanSource } from './pick-span-source';
import type { PendingInput } from './types';

// The fields a web client reads from a beforeinput event and its text box.
export interface BeforeInputFields {
  readonly inputType: string;
  readonly selectionEnd: number;
  readonly selectionStart: number;
}

// Builds the pending input from a beforeinput event. The selection is read before the edit lands,
// so it pins where the edit happens even next to repeated text.
export function buildPendingInput(fields: BeforeInputFields): PendingInput {
  return {
    selection: {
      backward: fields.inputType.endsWith('Backward'),
      end: fields.selectionEnd,
      start: fields.selectionStart,
    },
    source: pickSpanSource(fields.inputType),
  };
}
