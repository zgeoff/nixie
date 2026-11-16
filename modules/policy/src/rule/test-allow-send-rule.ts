import type { RuleEntry } from '../types';

export const testAllowSendRule: RuleEntry = {
  id: 'test.allow-send',
  revision: 1,
  rule: {
    id: 'test.allow-send',
    outcome: 'allow',
    tools: ['test.send', 'test.send_keyed', 'test.send_checked'],
  },
};
