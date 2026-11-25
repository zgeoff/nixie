import { sql } from 'kysely';
import type { Migration } from '../types';

// The ledger key joins the counter, the unit, the period kind and the period start. A charge from
// before the key names none, so the key takes the kind from the budget in force, and from the
// budget's ID suffix for a built-in budget, which no row of budgets_in_force holds.
const kindOfBudget = sql`coalesce(
  (select period from budgets_in_force where budgets_in_force.budget_id = budget_charges.budget_id),
  case
    when budget_charges.budget_id like '%-month' then 'month'
    when budget_charges.budget_id like '%-week' then 'week'
    else 'day'
  end
)`;

// spend_ledger replaces budget_ledger, which the release before reads, so the schema's oldest
// reader moves up to this migration. The amounts carry over, so a period under way keeps its count
// until the first rebuild folds the same rows from the records.
export const spendLedgerMigration: Migration = {
  name: 'replace the budget ledger with the spend ledger, keyed by counter, unit and period',
  up: async (tx) => {
    await sql`create table if not exists spend_ledger (
      ledger_key text primary key,
      counter text not null,
      unit text not null,
      period_kind text not null,
      period_start text not null,
      amount integer not null
    ) strict`.execute(tx);

    await sql`alter table budget_charges add column ledger_key text not null default ''`.execute(
      tx,
    );

    await sql`update budget_charges
      set ledger_key = 'budget:' || budget_id || '|micros:USD|' || ${kindOfBudget} || '|' || period_start`.execute(
      tx,
    );

    await sql`insert into spend_ledger (ledger_key, counter, unit, period_kind, period_start, amount)
      select distinct budget_charges.ledger_key, 'budget:' || budget_charges.budget_id, 'micros:USD',
        ${kindOfBudget}, budget_charges.period_start, budget_ledger.spent_micros
      from budget_charges
      join budget_ledger
        on budget_ledger.budget_id = budget_charges.budget_id
        and budget_ledger.period_start = budget_charges.period_start`.execute(tx);

    await sql`delete from projection_changes where projection = 'budget_ledger'`.execute(tx);
    await sql`drop table budget_ledger`.execute(tx);
  },
};
