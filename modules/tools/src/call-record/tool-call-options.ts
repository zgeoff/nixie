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

  // what a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;

  // the values nixie holds as its own, read when each result settles, so no result reaches the
  // model or the log with one of them in it
  readonly readOwnValues?: () => readonly string[];

  // The names of the tools that no step lists for now, such as a connector's tools whose scope the
  // owner left out. Each list and each call reads it again, so a conversation follows a consent
  // that changes it.
  readonly readHeldBackTools?: () => Promise<readonly string[]>;
}
