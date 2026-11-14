import { harnessCapabilities } from '@heynixie/wire';
import type { Harness } from '../harness';

// A stand-in for a harness with no session. HarnessID is a closed union, so a test cannot name a
// harness that nixie lacks; the stand-in takes the codex ID and capabilities, and has no session.
export function buildStubCodexHarness(overrides: Partial<Harness> = {}): Harness {
  return {
    id: 'codex',
    api: 'openai-responses',
    buildGrant: (secret) => ({ secret: secret.name, host: secret.host, env: {} }),
    guest: { package: 'codex', entries: { turn: 'main', check: null } },
    imageKey: 'conversation',
    toolUseMetaKey: null,
    toolCallWaitMs: null,
    capabilities: harnessCapabilities.codex,
    secretHeader: 'bearer',
    toTurnProfile: () => ({
      harness: 'agent-sdk',
      model: 'stub-model-1',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'bearer',
      contextTokens: null,
      cacheTTL: '5m',
    }),
    contextWindow: null,
    session: null,
    ...overrides,
  };
}
