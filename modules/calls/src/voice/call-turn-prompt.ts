import { defaultVoicePrompt } from './default-voice-prompt';

// What the call's turn is told after the conversation's prompt. The speech layer's own prompt is
// separate and stays as it is.
export const callTurnPrompt = [
  defaultVoicePrompt,
  [
    'Keep a spoken reply to about 3 sentences.',
    'When the answer is longer, such as a list or a plan, put it on a device with the device tools,',
    'then say where it is.',
    'The call’s device is the one devices.list marks onCall.',
    'Showing anything is your choice each time.',
  ].join(' '),
].join('\n\n');
