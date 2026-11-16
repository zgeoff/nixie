import { faker } from '@faker-js/faker';
import type { AgentSDKTurnProfile, HostFrame } from '../utils/host-frame';

// the frame of a mock whose profile is the Agent SDK's
type TurnFrame = Omit<Extract<HostFrame, { type: 'turn' }>, 'profile'> & {
  readonly profile: AgentSDKTurnProfile;
};

export interface TurnFrameOverrides {
  readonly profile?: Partial<AgentSDKTurnProfile>;
  readonly tools?: Partial<TurnFrame['tools']>;
  readonly resume?: TurnFrame['resume'];
  readonly systemPrompt?: string;
  readonly input?: TurnFrame['input'];
  readonly limits?: Partial<TurnFrame['limits']>;
}

export function buildMockTurnFrame(overrides: TurnFrameOverrides = {}): TurnFrame {
  return {
    type: 'turn',
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
    tools: {
      url: faker.internet.url(),
      token: faker.string.alphanumeric(32),
      ...overrides.tools,
    },
    resume: overrides.resume ?? null,
    systemPrompt: overrides.systemPrompt ?? faker.lorem.sentence(),
    input: overrides.input ?? [{ uuid: faker.string.uuid(), text: faker.lorem.sentence() }],
    limits: { modelCalls: null, toolCallWaitMs: null, ...overrides.limits },
  };
}
