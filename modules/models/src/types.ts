export type ModelRole =
  | 'conversation'
  | 'task'
  | 'worker'
  | 'checker'
  | 'memory-writer'
  | 'memory-consolidator';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type CacheTTL = '5m' | '1h';

export interface PriceRates {
  readonly input: number;

  readonly cacheWrite: number;
  readonly cacheWrite1h: number;
  readonly cachedInput: number;
  readonly output: number;
}

export interface LongPromptPrices extends PriceRates {
  readonly overTokens: number;
}

export interface ModelPrices extends PriceRates {
  readonly longPrompt?: LongPromptPrices;
}

export interface ModelProfile {
  readonly id: string;
  readonly baseURL: string;

  readonly credential: string;
  readonly authHeader: 'bearer' | 'x-api-key';
  readonly model: string;
  readonly effort: ReasoningEffort;

  readonly providerPin: string | null;

  readonly contextTokens: number | null;

  readonly cacheTTL: CacheTTL;

  readonly prices: ModelPrices | null;
}

export interface ModelsConfig {
  readonly profiles: Readonly<Record<string, ModelProfile>>;
  readonly roles: Readonly<Partial<Record<ModelRole, string>>> & { readonly conversation: string };
}

export interface ModelSecrets {
  readonly model_credentials?: Readonly<Record<string, string>>;
}

export interface ResolvedProfile {
  readonly profile: ModelProfile;
  readonly credential: string;
}
