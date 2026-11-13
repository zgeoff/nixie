import type { ToolDeclaration } from '../types';

// A mail tool that sends and writes, with every other field at its empty value.
export function buildTestToolDeclaration(name: string): ToolDeclaration {
  return {
    name,
    effects: ['send', 'write'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  };
}
