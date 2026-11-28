import type { BudgetsContext } from '@heynixie/budgets';
import type { Definitions, Log } from '@heynixie/log';
import type { DecisionPoint } from '@heynixie/policy';
import type { ProposalConfig } from '@heynixie/proposals';
import type { ActionQueue, ToolRegistry } from '../types';

export interface ToolCallOptions {
  readonly registry: ToolRegistry;
  readonly decide: DecisionPoint;

  // a decision point that runs past this denies the call; 30 seconds when absent
  readonly decisionDeadlineMs?: number;

  readonly log: Log;

  readonly definitions: () => Definitions;
  readonly queue: ActionQueue;

  readonly queuedWaitMs: number;
  readonly proposalConfig?: ProposalConfig | undefined;

  readonly retry?: ToolRetryOptions;

  // what a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;

  // the values nixie holds as its own, read when each result settles, so no result reaches the
  // model or the log with one of them in it
  readonly readOwnValues?: () => readonly string[];

  // The names of the tools that no step lists for now, such as a connector's tools whose scope the
  // owner left out. Each list and each call reads it again, so a conversation follows a consent
  // that changes it.
  readonly readHeldBackTools?: () => Promise<readonly string[]>;

  // The connections that are not forgotten. A run lists no tool whose pins all name other
  // connections. Without it, a pin never hides a tool.
  readonly readLiveConnections?: () => Promise<readonly ConnectionChoice[]>;
}

// How a direct call of a tool that reaches a provider tries again. A call that fails in a way that
// can clear tries again inside one time budget that covers every attempt and every wait.
export interface ToolRetryOptions {
  // 3 when absent
  readonly maxAttempts?: number;

  // 15 seconds when absent
  readonly budgetMs?: number;

  // the most characters of the provider's message that reach the model; 1,000 when absent
  readonly detailChars?: number;

  // a number from 0 up to 1 that spreads each backoff; Math.random when absent
  readonly random?: () => number;
}

export interface ConnectionChoice {
  // the short ID
  readonly connection: string;

  readonly label: string;
  readonly account: string;
}
