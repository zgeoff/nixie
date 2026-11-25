import type { BudgetsContext } from '@heynixie/budgets';
import type { WriteTransaction } from '@heynixie/log';
import type { PaidCallCapCall, ToolOutcome } from '../types';

// What a call to a paid tool charges, settled before the call is recorded: the charge lands in the
// transaction that records the call, so the record and its ledger rows commit together or not at
// all.
export interface PaidPlan {
  readonly toolName: string;
  readonly budgets: BudgetsContext;
  readonly priceMicros: number;
  readonly callID: string;
  readonly capCall: PaidCallCapCall | undefined;

  // frees what the tool's check held, for a call that ends before the tool runs
  readonly release: () => void;
}

export type PaidPreparation =
  | { readonly status: 'free' }
  | { readonly status: 'plan'; readonly plan: PaidPlan }

  // the tool's check ended the call, which charges nothing
  | { readonly status: 'ended'; readonly outcome: ToolOutcome };

export type PaidGate =
  | { readonly status: 'passed' }
  | { readonly status: 'capped'; readonly message: string }
  | { readonly status: 'refused'; readonly message: string };

// Runs in the transaction of the result record, so a credit and its result commit together.
export type CreditBeside = (tx: WriteTransaction) => Promise<number>;
