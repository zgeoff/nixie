import type { RuleEntry } from './types';

export const slice1QueueCheckRule: RuleEntry = {
  id: 'slice1.queue-check',
  revision: 1,
  rule: { id: 'slice1.queue-check', outcome: 'allow', tools: ['actions.log'] },
};
