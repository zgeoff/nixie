import { faker } from '@faker-js/faker';
import type { AgentSDKTurnProfile, HostFrame } from '../utils/host-frame';

// the frame of a mock whose profile is the Agent SDK's
type SummarizeFrame = Omit<Extract<HostFrame, { type: 'summarize' }>, 'profile'> & {
  readonly profile: AgentSDKTurnProfile;
};

export interface SummarizeFrameOverrides {
  readonly profile?: Partial<AgentSDKTurnProfile>;
  readonly resume?: SummarizeFrame['resume'];
  readonly systemPrompt?: string;
  readonly instruction?: string;
}

export function buildMockSummarizeFrame(overrides: SummarizeFrameOverrides = {}): SummarizeFrame {
  return {
    type: 'summarize',
    profile: {
      harness: 'agent-sdk',
      model: faker.string.alphanumeric(12),
      baseURL: faker.internet.url(),
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
      requestRewrite: null,
      ...overrides.profile,
    },
    resume: overrides.resume ?? {
      harness: 'agent-sdk',
      sessionID: faker.string.uuid(),
      messageID: faker.string.uuid(),
    },
    systemPrompt: overrides.systemPrompt ?? faker.lorem.sentence(),
    instruction: overrides.instruction ?? faker.lorem.sentence(),
  };
}
