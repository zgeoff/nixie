import { z } from 'zod';
import { runHostCommand } from './run-host-command';

const ledgerSchema = z.object({
  spentMicros: z.number(),
  charges: z.array(z.unknown()),
});

export type HostLedger = z.infer<typeof ledgerSchema>;

export async function readHostLedger(configPath: string, budgetID: string): Promise<HostLedger> {
  const printed = await runHostCommand(configPath, ['budgets', 'ledger', budgetID]);

  return ledgerSchema.parse(JSON.parse(printed.stdout));
}
