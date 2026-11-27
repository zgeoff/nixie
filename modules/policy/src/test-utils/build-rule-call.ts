import type { RuleCall } from '../types';

export function buildRuleCall(overrides: Partial<RuleCall> = {}): RuleCall {
  return {
    tool: 'mail.send',
    effects: ['send'],
    context: 'conversation',
    task: null,
    args: {},
    contentArgs: [],
    destinations: [],
    sources: ['owner'],
    at: Date.parse('2026-06-01T12:30:00Z'),
    ...overrides,
  };
}
