import type { GrantSpec } from '@heynixie/sandbox';
import { harnessCapabilities } from '@heynixie/wire';
import type { HarnessDefinition } from '../model/harness';
import type { ModelProfile, ReasoningEffort } from '../types';
import { agentSDKProfileSchema } from './agent-sdk-profile-schema';
import { getCLIContextWindow } from './get-cli-context-window';

const nixieBrokerPlaceholder = 'nixie-broker-placeholder';

// The fields of an Agent SDK profile beyond the 6 every harness has.
export interface AgentSDKProfile extends ModelProfile {
  readonly harness: 'agent-sdk';
  readonly authHeader: 'bearer' | 'x-api-key';
  readonly effort: ReasoningEffort;
  readonly contextTokens: number | null;
  readonly cacheTTL: '5m' | '1h';
  readonly providerPin: string | null;

  // true: a model outside Claude, and the guest rewrites its requests. false: nixie takes the model
  // as it is. null: the profile states nothing, which the load rules allow only for a Claude model.
  readonly outsideClaude: boolean | null;
}

export const agentSDKHarnessDefinition: HarnessDefinition<'agent-sdk', AgentSDKProfile> = {
  id: 'agent-sdk',
  profileSchema: agentSDKProfileSchema,
  bind: (profile) => ({
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
    guest: { package: 'conversation', entries: { turn: 'main', check: 'check' } },
    imageKey: 'conversation',
    sizeRows: { conversation: 'conversation', systemTask: 'systemTask' },
    toolUseMetaKey: 'claudecode/toolUseId',

    // the CLI's per-server tool-call timeout, which the tool-call wait probe proves
    toolCallWaitMs: 900_000,

    capabilities: harnessCapabilities['agent-sdk'],
    secretHeader: profile.authHeader,
    contextWindow: profile.contextTokens ?? getCLIContextWindow(profile.model),
    rewritesRequests: profile.outsideClaude === true,
    toTurnProfile: (use) => ({
      harness: 'agent-sdk',
      model: profile.model,
      baseURL: profile.baseURL,
      effort: profile.effort,
      authHeader: profile.authHeader,
      contextTokens: profile.contextTokens,
      cacheTTL: use === 'one-off' ? '5m' : profile.cacheTTL,
      requestRewrite: profile.outsideClaude === true ? { providerPin: profile.providerPin } : null,
    }),
  }),
  session: {
    owns: (point) => point.harness === 'agent-sdk',
    nameSession: (point) => point.sessionID,

    // The CLI keeps a session's transcript, and a folder of the files its tools wrote beside it.
    listFiles: (point) => [`${point.sessionID}.jsonl`, `${point.sessionID}/`],
  },
};
