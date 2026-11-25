import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { pickerSetCodec } from '../record/picker-set-codec';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables, OperationAttempt, SetPickerResult } from '../types';

export interface PickerSettings {
  readonly pickerKey: string;
  readonly projectNumber: string;
}

// Sets the Drive picker's API key and project number on the client, or clears both with null. The
// change, its record and the caller's outcome commit in one transaction.
export function setPicker(
  context: ServiceContext,
  shortID: string,
  picker: PickerSettings | null,
  attempt?: OperationAttempt<SetPickerResult>,
): Promise<SetPickerResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const updated = await tx
      .$extendTables<ConnectionTables>()
      .updateTable('oauth_clients')
      .set({
        picker_key: picker?.pickerKey ?? null,
        project_number: picker?.projectNumber ?? null,
      })
      .where('short_id', '=', shortID)
      .where('removed_at', 'is', null)
      .executeTakeFirst();

    const result: SetPickerResult =
      updated.numUpdatedRows === 0n ? { kind: 'client_not_found' } : { kind: 'ok' };

    if (result.kind === 'ok') {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: pickerSetCodec.kind,
          definitions: context.definitions(),
          payload: pickerSetCodec.encode({ client: shortID }),
        },
      ]);
    }

    await attempt?.settle(tx, result);

    return result;
  });
}
