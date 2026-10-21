import { hasSeveralWords } from './has-several-words';
import { pickSpanSource } from './pick-span-source';
import type { PendingInput } from './types';

export interface BeforeInputFields {
  readonly inputType: string;

  readonly data: string | null;
  readonly selectionEnd: number;
  readonly selectionStart: number;
}

export function buildPendingInput(fields: BeforeInputFields): PendingInput {
  const pending = {
    selection: {
      backward: fields.inputType.endsWith('Backward'),
      end: fields.selectionEnd,
      start: fields.selectionStart,
    },
    source: pickSpanSource(fields.inputType, fields.data),
  };

  return fields.inputType === 'insertText' && fields.data !== null && hasSeveralWords(fields.data)
    ? { ...pending, respacing: fields.data }
    : pending;
}
