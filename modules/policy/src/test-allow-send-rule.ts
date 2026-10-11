import type { FixedRule } from './types';

// The test build's rule for the crash tests: it allows test.send from the test connector and covers
// no other call. Only a test build reaches this module, so the release bundle never holds it.
export const testAllowSendRule: FixedRule = {
  id: 'test.allow-send',
  revision: 1,
  sentence: "Allow test.send from the crash tests' test connector.",
  pickOutcome: (call) => (call.tool === 'test.send' ? 'allow' : null),
};
