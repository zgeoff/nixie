import { expect, test } from 'bun:test';
import { pickMicrophoneRefusal } from './pick-microphone-refusal';

test.each([
  { name: 'NotAllowedError', refusal: 'microphone-blocked' },
  { name: 'SecurityError', refusal: 'microphone-blocked' },
  { name: 'NotFoundError', refusal: 'microphone-missing' },
  { name: 'AbortError', refusal: 'microphone-failed' },
] as const)('#pickMicrophoneRefusal reads a $name as $refusal', (row) => {
  const error = new DOMException('refused', row.name);

  expect(pickMicrophoneRefusal(error)).toBe(row.refusal);
});

test('#pickMicrophoneRefusal reads a value that is no error as a failure', () => {
  expect(pickMicrophoneRefusal('no')).toBe('microphone-failed');
});
