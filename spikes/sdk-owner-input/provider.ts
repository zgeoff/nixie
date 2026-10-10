// Picks the model and its credential: Haiku on the subscription by default, or GLM 5.3 through
// Z.ai's Anthropic-compatible endpoint when NIXIE_SPIKE_PROVIDER is glm.
const glmModel = 'glm-5.3';

export interface Provider {
  env: Record<string, string>;
  model: string;
}

export function readProvider(): Provider {
  if (process.env.NIXIE_SPIKE_PROVIDER !== 'glm') {
    return {
      env: { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '' },
      model: 'claude-haiku-4-5-20251001',
    };
  }
  const key = process.env.ZAI_API_KEY ?? '';
  if (!key) {
    throw new Error('NIXIE_SPIKE_PROVIDER=glm needs ZAI_API_KEY');
  }
  return {
    env: {
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_BASE_URL: process.env.NIXIE_SPIKE_BASE_URL ?? 'https://api.z.ai/api/anthropic',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: glmModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: glmModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: glmModel,
    },
    model: glmModel,
  };
}
