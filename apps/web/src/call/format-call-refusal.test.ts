import { expect, test } from 'bun:test';
import { formatCallRefusal } from './format-call-refusal';

test('#formatCallRefusal tells the user how to unblock a blocked microphone', () => {
  expect(formatCallRefusal('microphone-blocked')).toContain('browser settings');
});

test('#formatCallRefusal says when voice calls are off', () => {
  expect(formatCallRefusal('voice-off')).toBe('Voice calls are off on this nixie.');
});
