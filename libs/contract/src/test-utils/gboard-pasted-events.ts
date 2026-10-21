import type { RecordedInputEvent } from './build-span-state-from-events';

// Gboard 18.4.1 recorded these into a textarea in Chrome 155 on Android 16. The copied text is
// invented.
export const gboardPastedEvents = {
  'long-press': [
    {
      event: 'beforeinput',
      inputType: 'insertFromPaste',
      data: 'long-press test words',
      selection: [0, 0],
    },
    { event: 'input', value: 'long-press test words' },
  ],
  chip: [
    { event: 'beforeinput', inputType: 'insertText', data: 'chip test words', selection: [0, 0] },
    { event: 'input', value: 'chip test words' },
  ],
} satisfies Record<string, readonly RecordedInputEvent[]>;
