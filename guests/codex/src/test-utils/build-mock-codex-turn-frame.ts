import type { HostFrame } from '@heynixie/wire';
import type { CodexTurnFrame } from '../turn/run-codex-turn';

export interface CodexTurnFrameOverrides {
  readonly input?: CodexTurnFrame['input'];
  readonly limits?: CodexTurnFrame['limits'];
  readonly chatgptLogin?: CodexTurnFrame['profile']['chatgptLogin'];
}

// The frame of a turn on the codex harness, which a host frame type holds
export function buildMockCodexTurnFrame(overrides: CodexTurnFrameOverrides = {}): HostFrame {
  return {
    type: 'turn',
    profile: {
      harness: 'codex',
      model: 'gpt-test-1',
      baseURL: 'https://models.example.test/v1',
      effort: 'high',
      chatgptLogin: overrides.chatgptLogin ?? null,
    },
    tools: { url: 'http://127.0.0.1:8901', token: 'step-token' },
    systemPrompt: 'You are nixie.',
    input: overrides.input ?? [{ uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', text: 'Hi.' }],
    limits: overrides.limits ?? { modelCalls: null, toolCallWaitMs: null },
  };
}
