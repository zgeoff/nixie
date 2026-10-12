import { faker } from '@faker-js/faker';
import type { HostFrame, TurnProfile } from '../host-frame';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

export interface TurnFrameOverrides {
  readonly profile?: Partial<TurnProfile>;
  readonly tools?: Partial<TurnFrame['tools']>;
  readonly resume?: TurnFrame['resume'];
  readonly systemPrompt?: string;
  readonly input?: TurnFrame['input'];
}

// A turn frame that starts a fresh session from one inbox message. Each nested override merges
// into fresh defaults.
export function buildMockTurnFrame(overrides: TurnFrameOverrides = {}): TurnFrame {
  return {
    type: 'turn',
    profile: {
      model: faker.string.alphanumeric(12),
      baseURL: faker.internet.url(),
      effort: 'medium',
      authHeader: 'x-api-key',
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
  };
}
