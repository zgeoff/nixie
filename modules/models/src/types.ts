import type { HarnessID } from '@heynixie/wire';
import type { AgentSDKProfile } from './agent/agent-sdk-harness-definition';
import type { CodexProfile } from './codex/codex-harness-definition';
import type { modelRoles } from './role/model-roles';

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
export type HarnessProfile = AgentSDKProfile | CodexProfile;

export interface SelectableModel {
  readonly name: string;
  readonly profile: string;
  readonly description: string;

  readonly isAsked: boolean;
}

export interface WorkerRunLimits {
  readonly minutes: number;
  readonly turns: number;
  readonly tokens: number;
  readonly dollars: number;
}

interface DayLimits {
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
  readonly turnCap: number;
}

interface MonthLimits {
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
}

export interface TaskRunLimits {
  readonly turns: number;
  readonly dollars: number;
}

// A profile as its schema parses it, before the config key gives it an ID. It distributes over the
// union, because Omit alone drops the members' own fields.
export type ProfileFields<Profile extends ModelProfile = HarnessProfile> =
  Profile extends ModelProfile ? Omit<Profile, 'id'> : never;

export interface ModelsConfig {
  readonly profiles: Readonly<Record<string, HarnessProfile>>;
  readonly roles: Readonly<Partial<Record<ModelRole, string>>> & { readonly conversation: string };
  readonly selectable: readonly SelectableModel[];
  readonly limits: {
    readonly taskRun: { readonly default: TaskRunLimits; readonly max: TaskRunLimits };
    readonly workerRun: WorkerRunLimits;
    readonly day: DayLimits;
    readonly month: MonthLimits;
  };
}

export interface ModelSecrets {
  readonly model_credentials?: Readonly<Record<string, string>>;
}

export interface ResolvedProfile {
  readonly profile: HarnessProfile;

  readonly credential: string | null;
}
