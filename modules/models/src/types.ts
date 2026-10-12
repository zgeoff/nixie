import type { Sandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { RunEndpoint, ToolRunModel } from '@heynixie/tools';
import type { GuestCommand } from './run-guest-turn';

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

  // the context window, in tokens, that the conversation's CLI compacts within instead of the
  // model's own window
  readonly contextTokens: number | null;

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

// The conversation's runner as one step sees it: its sandbox, its endpoint and its profile.
export interface ConversationRun {
  readonly context: TasksContext;
  readonly profile: ResolvedProfile;
  readonly sandbox: Sandbox;
  readonly endpoint: Pick<RunEndpoint, 'token'>;
  readonly model: ToolRunModel;
  readonly command: GuestCommand;

  // the persona in force, read at each turn so a new seed reaches the next turn
  readonly getSystemPrompt: () => string;

  // the note of memory changes made outside the conversation since its last turn, which goes
  // before the turn's first message, and the sequence it covers
  readonly readTurnNote?: () => Promise<TurnNote>;
}

// A note for the start of a turn and the last sequence it covers, which the turn's end record
// keeps, so the next turn's note starts after it.
export interface TurnNote {
  readonly text: string | null;
  readonly throughSequence: number;
}
