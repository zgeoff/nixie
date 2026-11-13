import type { PolicyCall } from '../types';

export function buildPolicyCall(overrides: Partial<PolicyCall> = {}): PolicyCall {
  return {
    tool: 'mail.send',
    toolList: ['mail.send'],
    context: 'conversation',
    definitionID: null,
    args: {},
    destinations: [],
    sources: ['owner'],
    at: 1_794_550_000_000,
    turnMessageSequence: null,
    onBehalfOf: [],
    snapshot: 'snapshot-1',
    ...overrides,
  };
}
