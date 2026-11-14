import type { HarnessID } from '@heynixie/wire';
import type { AgentSDKProfile } from './agent-sdk-harness-definition';
import type { modelRoles } from './model-roles';

export type ModelRole = (typeof modelRoles)[number];

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PriceRates {
  readonly input: number;

  readonly cacheWrite: number;
  readonly cacheWrite1h: number;
  readonly cachedInput: number;
  readonly output: number;
}

interface LongPromptPrices extends PriceRates {
  readonly overTokens: number;
}

export interface ModelPrices extends PriceRates {
  readonly longPrompt?: LongPromptPrices;
}

// The 6 fields every harness's profile has, with one meaning on each.
export interface ModelProfile {
  readonly id: string;
  readonly harness: HarnessID;
  readonly baseURL: string;
  readonly credential: string;
  readonly model: string;
  readonly prices: ModelPrices | null;
}

// The union of each definition's profile type.
export type HarnessProfile = AgentSDKProfile;

export interface SelectableModel {
  readonly name: string;
  readonly profile: string;
  readonly description: string;

  readonly isAsked: boolean;
}

export interface TaskRunLimits {
  readonly turns: number;
  readonly dollars: number;
}

// A profile with the ID that its config key gave it.
type WithID<Profile extends ModelProfile> = { readonly id: string } & Omit<Profile, 'id'>;

export interface ModelsConfig<Profile extends ModelProfile = HarnessProfile> {
  readonly profiles: Readonly<Record<string, WithID<Profile>>>;
  readonly roles: Readonly<Partial<Record<ModelRole, string>>> & { readonly conversation: string };
  readonly selectable: readonly SelectableModel[];
  readonly limits: {
    readonly taskRun: { readonly default: TaskRunLimits; readonly max: TaskRunLimits };
  };
}

export interface ModelSecrets {
  readonly model_credentials?: Readonly<Record<string, string>>;
}

export interface ResolvedProfile {
  readonly profile: HarnessProfile;

  readonly credential: string | null;
}
