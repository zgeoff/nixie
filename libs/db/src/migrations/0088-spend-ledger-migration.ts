import { sql } from 'kysely';
import type { Migration } from '../types';

// A charge's kind comes only from a fact in the old rows, never a guess from its date: a budget can
// change its period after a charge on a day that starts several kinds of period. A charge with no
// such fact keeps a null kind, and counts nowhere.
const kindsOfCharges = sql`
  with charge_records as (
    select json_extract(payload, '$.chargeID') as charge_id, max(sequence) as sequence
    from records
    where kind = 'budget.charged'
    group by 1
  ),
  seeded as (
    select distinct json_extract(json_each.value, '$.id') as budget_id
    from records, json_each(records.payload, '$.repoBudgets')
    where records.kind = 'definitions_seeded'
  ),
  facts as (
    select budget_charges.charge_id, budget_charges.budget_id,
      case when budgets_in_force.updated_sequence < charge_records.sequence
        then budgets_in_force.period end as in_force_kind,
      budgets_in_force.budget_id is null and seeded.budget_id is null as is_built_in,
      substr(budget_charges.period_start, 9, 2) = '01' as is_month_start,
      strftime('%w', budget_charges.period_start) = '1' as is_week_start
    from budget_charges
    left join charge_records on charge_records.charge_id = budget_charges.charge_id
    left join budgets_in_force on budgets_in_force.budget_id = budget_charges.budget_id
    left join seeded on seeded.budget_id = budget_charges.budget_id
  )
  select charge_id,
    case
      when in_force_kind is not null then in_force_kind
      when is_built_in and budget_id like '%-day' then 'day'
      when is_built_in and budget_id like '%-month' then
        case when is_month_start then 'month' end
      when not is_month_start and not is_week_start then 'day'
    end
  from facts`;

// spend_ledger replaces budget_ledger, which the release before reads, so the schema's oldest
// reader moves up to this migration. Each row sums its uncredited charges, as a rebuild does.
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

    await sql`alter table budget_charges add column ledger_key text`.execute(tx);

    await sql`create table if not exists legacy_charge_kinds (
      charge_id text primary key,
      period_kind text
    ) strict`.execute(tx);

    await sql`insert into legacy_charge_kinds (charge_id, period_kind) ${kindsOfCharges}`.execute(
      tx,
    );

    await sql`update budget_charges
      set ledger_key = (select 'budget:' || budget_charges.budget_id || '|micros:USD|'
          || legacy_charge_kinds.period_kind || '|' || budget_charges.period_start
        from legacy_charge_kinds
        where legacy_charge_kinds.charge_id = budget_charges.charge_id)`.execute(tx);

    await sql`insert into spend_ledger (ledger_key, counter, unit, period_kind, period_start, amount)
      select budget_charges.ledger_key, 'budget:' || budget_charges.budget_id, 'micros:USD',
        legacy_charge_kinds.period_kind, budget_charges.period_start,
        sum(case when budget_charges.credited = 0 then budget_charges.amount_micros else 0 end)
      from budget_charges
      join legacy_charge_kinds on legacy_charge_kinds.charge_id = budget_charges.charge_id
      where budget_charges.ledger_key is not null
      group by budget_charges.ledger_key`.execute(tx);

    await sql`delete from projection_changes where projection = 'budget_ledger'`.execute(tx);
    await sql`drop table budget_ledger`.execute(tx);
  },
};
