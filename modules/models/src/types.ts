// The model roles, each of which names the profile it uses.
export type ModelRole = 'conversation' | 'task' | 'worker' | 'checker' | 'memory-writer';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Prices per million tokens, in the deployment's currency.
export interface ModelPrices {
  readonly input: number;
  readonly cacheWrite: number;
  readonly cachedInput: number;
  readonly output: number;
}

// A named route to one model on one Anthropic-compatible endpoint.
export interface ModelProfile {
  // a stable slug, such as chat-direct, which every record of the profile's output names
  readonly id: string;
  readonly baseURL: string;

  // a reference such as deployment:anthropic, never the credential itself
  readonly credential: string;
  readonly authHeader: 'bearer' | 'x-api-key';
  readonly model: string;
  readonly effort: ReasoningEffort;

  // the upstream provider an aggregator endpoint must keep to, so its prompt cache holds
  readonly providerPin: string | null;

  // parsed for the counting proxy, which prices each response; nothing here reads them
  readonly prices: ModelPrices | null;
}

// The profiles and the role map, from the deployment configuration. The conversation role is
// always set; any other role left unset uses the conversation's profile.
export interface ModelsConfig {
  readonly profiles: Readonly<Record<string, ModelProfile>>;
  readonly roles: Readonly<Partial<Record<ModelRole, string>>> & { readonly conversation: string };
}

// The part of nixie's decrypted secrets file that holds the model credentials, by name.
export interface ModelSecrets {
  readonly model_credentials?: Readonly<Record<string, string>>;
}

// A profile with its credential resolved, as a model loop starts on it.
export interface ResolvedProfile {
  readonly profile: ModelProfile;
  readonly credential: string;
}
