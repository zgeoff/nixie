import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { ActionRiskClass, ActionsTables } from '../types';

// Puts an action in the risk class that an approval of an always-ask or lifting action leaves it in.
export async function seedActionRiskClass(
  writer: Writer,
  actionID: string,
  riskClass: ActionRiskClass,
): Promise<void> {
  await withWriteTransaction(writer, async (tx) => {
    await tx
      .$extendTables<ActionsTables>()
      .updateTable('actions')
      .set({ risk_class: riskClass })
      .where('action_id', '=', actionID)
      .execute();
  });
}
