import { sql } from 'kysely';
import type { Migration } from '../types';

// The migration only adds tables, and nothing fills them from existing rows, so the release before
// still opens the database. budgets_in_force holds the limits that the seed put in force: a raised
// limit waits in a proposal, so the definitions alone no longer give the limit in force.
export const budgetsMigration: Migration = {
  name: 'add the budget tables',
  up: async (tx) => {
    await sql`create table if not exists budget_charges (
      charge_id text primary key,
      budget_id text not null,
      period_start text not null,
      amount_micros integer not null check (amount_micros > 0),
      for_kind text not null,
      for_id text not null,
      credited integer not null default 0
    ) strict`.execute(tx);

    await sql`create index if not exists budget_charges_for on budget_charges (for_kind, for_id)`.execute(
      tx,
    );

    await sql`create table if not exists budget_ledger (
      budget_id text not null,
      period_start text not null,
      spent_micros integer not null,
      primary key (budget_id, period_start)
    ) strict`.execute(tx);

    await sql`create table if not exists budgets_in_force (
      budget_id text primary key,
      counts text not null,
      limit_micros integer not null,
      period text not null,
      hash text not null,
      updated_sequence integer not null
    ) strict`.execute(tx);
  },
};
