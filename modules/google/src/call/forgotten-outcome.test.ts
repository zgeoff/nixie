import { expect, test } from 'bun:test';
import { renderFailureMessage } from '@heynixie/tools';
import { forgottenOutcome } from './forgotten-outcome';

test('it gives the forgotten connection the message that nixie writes for connection_unavailable', () => {
  const message: string = forgottenOutcome.message;

  expect(message).toBe(
    renderFailureMessage({ code: 'connection_unavailable' }, { nowMs: 0, detailChars: 1000 }),
  );
});
