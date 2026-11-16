import type { GrantSpec } from '@heynixie/sandbox';
import type { codexEfforts } from '@heynixie/wire';
import { harnessCapabilities } from '@heynixie/wire';
import type { HarnessDefinition } from '../model/harness';
import type { ModelProfile } from '../types';
import { codexProfileSchema } from './codex-profile-schema';

const nixieBrokerPlaceholder = 'nixie-broker-placeholder';

// The fields of a Codex profile beyond the 6 every harness has.
export interface CodexProfile extends ModelProfile {
  readonly harness: 'codex';
  readonly effort: (typeof codexEfforts)[number];
}

export const codexHarnessDefinition: HarnessDefinition<'codex', CodexProfile> = {
  id: 'codex',
  profileSchema: codexProfileSchema,
  bind: (profile) => ({
    id: 'codex',
    api: 'openai-responses',
    buildGrant: (secret): GrantSpec => ({
      secret: secret.name,
      host: secret.host,
      env: { OPENAI_API_KEY: nixieBrokerPlaceholder },
    }),
    guest: { package: 'codex', entries: { turn: 'main', check: null } },
    imageKey: 'codex',
    sizeRows: { conversation: null, systemTask: 'codexTask' },
    toolUseMetaKey: 'callId',

    // the CLI's per-server tool-call timeout, which the tool-call wait probe proves
    toolCallWaitMs: 900_000,
    capabilities: harnessCapabilities.codex,

    // The ChatGPT plan login confirms this on a real model.
    secretHeader: 'bearer',
    contextWindow: null,
    rewritesRequests: false,
    toTurnProfile: () => ({
      harness: 'codex',
      model: profile.model,
      baseURL: profile.baseURL,
      effort: profile.effort,
    }),
  }),
  session: null,
};
