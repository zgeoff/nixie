import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import type { BudgetCounts, BudgetPeriod } from '@heynixie/policy';

// What a budget limits: the limit in force, or a built-in limit of a paid tool.
export interface BudgetLimit {
  readonly id: string;
  readonly counts: BudgetCounts;
  readonly limitMicros: number;
  readonly period: BudgetPeriod;
}

export interface BudgetsContext {
  readonly log: Log;
  readonly clock: Clock;

  // the zone in which each period starts at local midnight, the time tool's default zone
  readonly zone: string;
  readonly definitions: () => Definitions;

  // the built-in budgets of the paid tools, which a budget in force with the same ID overrides; read
  // at each use, because the tools start after the context
  readonly builtIn: () => readonly BudgetLimit[];
}

export interface ChargeFor {
  readonly kind: 'tool_call' | 'action';
  readonly id: string;
}

export interface ChargeRequest {
  readonly budgetIDs: readonly string[];
  readonly amountMicros: number;
  readonly for: ChargeFor;

  // charges though a budget lacks room, for a call that has run and billed already
  readonly overdraw?: true;
}

export interface BudgetReached {
  readonly error: 'budget_reached';
  readonly budgetID: string;
  readonly period: BudgetPeriod;
  readonly spentMicros: number;
  readonly limitMicros: number;

  // the instant the budget's period ends
  readonly resetsAt: number;

  // the ISO date on which the next period starts
  readonly resetsOn: string;
}

export interface BudgetUnknown {
  readonly error: 'budget_unknown';
  readonly budgetID: string;
}

export type ChargeResult =
  | { readonly chargeIDs: readonly string[] }
  | BudgetReached
  | BudgetUnknown;

interface BudgetChargeRow {
  readonly charge_id: string;
  readonly budget_id: string;
  readonly period_start: string;
  readonly amount_micros: number;
  readonly for_kind: string;
  readonly for_id: string;
  readonly credited: number;

  // null for a charge from before the ledger whose period the old rows could not show
  readonly ledger_key: string | null;
}

interface SpendLedgerRow {
  readonly ledger_key: string;
  readonly counter: string;
  readonly unit: string;
  readonly period_kind: string;
  readonly period_start: string;
  readonly amount: number;
}

interface LegacyChargeKindRow {
  readonly charge_id: string;
  readonly period_kind: string | null;
}

interface BudgetInForceRow {
  readonly budget_id: string;
  readonly counts: string;
  readonly limit_micros: number;
  readonly period: string;
  readonly hash: string;
  readonly updated_sequence: number;
}

export type BudgetsTables = CheckedTables<
  Readonly<{
    budget_charges: BudgetChargeRow;
    spend_ledger: SpendLedgerRow;
    budgets_in_force: BudgetInForceRow;
    legacy_charge_kinds: LegacyChargeKindRow;
  }>
>;
