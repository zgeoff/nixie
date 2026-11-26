import { expect, test } from 'bun:test';
import { callTurnPrompt } from './call-turn-prompt';
import { defaultVoicePrompt } from './default-voice-prompt';

test('it tells the call turn to keep speech to about 3 sentences and put long material on a device', () => {
  expect(callTurnPrompt).toContain('Keep a spoken reply to about 3 sentences.');

  expect(callTurnPrompt).toContain(
    'put it on a device with the device tools, then say where it is',
  );

  expect(callTurnPrompt).toContain('the one devices.list marks onCall');
  expect(callTurnPrompt).toContain('Showing anything is your choice each time.');
});

test('it leaves the speech layer prompt free of the device rule', () => {
  expect(defaultVoicePrompt).not.toContain('device');
});
