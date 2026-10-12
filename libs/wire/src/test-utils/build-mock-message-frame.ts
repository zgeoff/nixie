import { faker } from '@faker-js/faker';
import type { HostFrame, InboxMessage } from '../host-frame';

type MessageFrame = Extract<HostFrame, { type: 'message' }>;

export interface MessageFrameOverrides {
  readonly message?: Partial<InboxMessage>;
}

// A message frame that carries one inbox message to the running turn. The message override merges
// into fresh defaults.
export function buildMockMessageFrame(overrides: MessageFrameOverrides = {}): MessageFrame {
  return {
    type: 'message',
    message: { uuid: faker.string.uuid(), text: faker.lorem.sentence(), ...overrides.message },
  };
}
