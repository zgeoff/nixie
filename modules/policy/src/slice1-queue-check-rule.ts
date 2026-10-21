import type { FixedRule } from './types';

export const slice1QueueCheckRule: FixedRule = {
  id: 'slice1.queue-check',
  revision: 1,
  sentence: "Allow actions.log, which writes one line to nixie's server log.",
  pickOutcome: (call) => (call.tool === 'actions.log' ? 'allow' : null),
};
