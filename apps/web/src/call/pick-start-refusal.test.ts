import { expect, test } from 'bun:test';
import { pickStartRefusal } from './pick-start-refusal';

test.each([
  { code: 'VOICE_OFF', refusal: 'voice-off' },
  { code: 'SPEECH_UNAVAILABLE', refusal: 'speech-unavailable' },
  { code: 'VOICE_PRICE_MISSING', refusal: 'price-missing' },
  { code: 'CALL_RUNNING', refusal: 'call-running' },
  { code: 'CALL_BUDGET_REACHED', refusal: 'budget-reached' },
  { code: 'VOICE_CREDENTIAL_REFUSED', refusal: 'credential-refused' },
  { code: 'SOMETHING_ELSE', refusal: 'failed' },
] as const)('#pickStartRefusal reads the code $code as $refusal', (row) => {
  const error = Object.assign(new Error('no'), { code: row.code });

  expect(pickStartRefusal(error)).toBe(row.refusal);
});

test('#pickStartRefusal reads an error with no code as a failure', () => {
  expect(pickStartRefusal(new Error('network'))).toBe('failed');
});
