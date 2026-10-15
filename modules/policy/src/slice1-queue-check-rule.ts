import type { FixedRule } from './types';

// Allows actions.log, the log-only connector's tool, and covers no other call, so the queue check
// reaches the action queue under the read-only rule. Only the queue check's tool list holds the
// tool, so the scope stage denies it to every other run before this rule is tried.
export const slice1QueueCheckRule: FixedRule = {
  id: 'slice1.queue-check',
  revision: 1,
  sentence: "Allow actions.log, which writes one line to nixie's server log.",
  pickOutcome: (call) => (call.tool === 'actions.log' ? 'allow' : null),
};
