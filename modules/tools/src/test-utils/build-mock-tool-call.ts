import { faker } from '@faker-js/faker';
import type { ToolCall } from '../types';

export function buildMockToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    callID: faker.string.uuid(),
    tool: faker.string.alpha({ length: 12, casing: 'lower' }),
    input: {},
    toolUseID: null,
    ...overrides,
  };
}
