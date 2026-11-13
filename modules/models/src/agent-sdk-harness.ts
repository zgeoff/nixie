import type { GrantSpec } from '@heynixie/sandbox';
import type { HarnessDescriptor } from './harness-descriptor';

const nixieBrokerPlaceholder = 'nixie-broker-placeholder';

export const agentSDKHarness: HarnessDescriptor = {
  id: 'agent-sdk',
  api: 'anthropic-messages',
  buildGrant: (secret): GrantSpec => ({
    secret: secret.name,
    host: secret.host,
    env:
      secret.header === 'bearer'
        ? { ANTHROPIC_AUTH_TOKEN: nixieBrokerPlaceholder }
        : { ANTHROPIC_API_KEY: nixieBrokerPlaceholder },
  }),
  toTurnProfile: (profile) => ({
    harness: 'agent-sdk',
    model: profile.model,
    baseURL: profile.baseURL,
    effort: profile.effort,
    authHeader: profile.authHeader,
    contextTokens: profile.contextTokens,
    cacheTTL: profile.cacheTTL,
  }),
  guest: { package: 'conversation', entries: { turn: 'main', check: 'check' } },
  imageKey: 'conversation',
  toolUseMetaKey: 'claudecode/toolUseId',

  // The CLI keeps a session's transcript, and a folder of the files its tools wrote beside it.
  listSessionFiles: (point) => [`${point.sessionID}.jsonl`, `${point.sessionID}/`],
};
