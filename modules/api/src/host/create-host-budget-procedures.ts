// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readBudgetLedger, readBudgetStatuses } from '@heynixie/budgets';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

// The host lists each budget with what its period has spent, and reads one budget's charges.
export function createHostBudgetProcedures(context: APIContext) {
  const budgets = hostImplementer.budgets;

  return {
    list: budgets.list.handler(async (options) => {
      if (context.budgets === undefined) {
        throw options.errors.BUDGETS_NOT_CONFIGURED();
      }

      const statuses = await readBudgetStatuses(context.log.writer.db, context.budgets);

      return statuses.map((status) => ({
        budgetID: status.id,
        counts: status.counts,
        limitMicros: status.limitMicros,
        period: status.period,
        spentMicros: status.spentMicros,
        resetsAt: new Date(status.resetsAt),
        source: status.source,
      }));
    }),

    ledger: budgets.ledger.handler(async (options) => {
      if (context.budgets === undefined) {
        throw options.errors.BUDGETS_NOT_CONFIGURED();
      }

      const ledger = await readBudgetLedger(
        context.log.writer.db,
        context.budgets,
        options.input.budgetID,
      );

      if (ledger === null) {
        throw options.errors.NOT_FOUND();
      }

      return {
        budgetID: ledger.budgetID,
        periodStart: ledger.periodStart,
        resetsAt: new Date(ledger.resetsAt),
        spentMicros: ledger.spentMicros,
        charges: ledger.charges.map((charge) => ({
          chargeID: charge.chargeID,
          amountMicros: charge.amountMicros,
          for: charge.for,
          isCredited: charge.isCredited,
        })),
      };
    }),
  };
}
