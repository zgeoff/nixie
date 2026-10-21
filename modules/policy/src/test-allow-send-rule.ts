import type { FixedRule } from './types';

export const testAllowSendRule: FixedRule = {
  id: 'test.allow-send',
  revision: 1,
  sentence: "Allow test.send from the crash tests' test connector.",
  pickOutcome: (call) => (call.tool === 'test.send' ? 'allow' : null),
};
