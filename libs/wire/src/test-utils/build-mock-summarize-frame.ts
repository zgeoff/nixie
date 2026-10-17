import { faker } from '@faker-js/faker';
import type { HostFrame, TurnProfile } from '../host-frame';

type SummarizeFrame = Extract<HostFrame, { type: 'summarize' }>;

export interface SummarizeFrameOverrides {
  readonly profile?: Partial<TurnProfile>;
  readonly resume?: SummarizeFrame['resume'];
  readonly systemPrompt?: string;
  readonly instruction?: string;
}

// A summarize frame that asks for a summary of a session at one point. The profile override merges
// into fresh defaults.
export function buildMockSummarizeFrame(overrides: SummarizeFrameOverrides = {}): SummarizeFrame {
  return {
    type: 'summarize',
    profile: {
      model: faker.string.alphanumeric(12),
      baseURL: faker.internet.url(),
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
      ...overrides.profile,
    },
    resume: overrides.resume ?? { sessionID: faker.string.uuid(), messageID: faker.string.uuid() },
    systemPrompt: overrides.systemPrompt ?? faker.lorem.sentence(),
    instruction: overrides.instruction ?? faker.lorem.sentence(),
  };
}
