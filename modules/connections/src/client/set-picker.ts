import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { pickerSetCodec } from '../record/picker-set-codec';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables, SetPickerResult } from '../types';

export interface PickerSettings {
  readonly pickerKey: string;
  readonly projectNumber: string;
}

// Sets the Drive picker's API key and project number on the client, or clears both with null.
export async function setPicker(
  context: ServiceContext,
  shortID: string,
  picker: PickerSettings | null,
): Promise<SetPickerResult> {
  const updated = await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<ConnectionTables>()
      .updateTable('oauth_clients')
      .set({
        picker_key: picker?.pickerKey ?? null,
        project_number: picker?.projectNumber ?? null,
      })
      .where('short_id', '=', shortID)
      .where('removed_at', 'is', null)
      .executeTakeFirst(),
  );

  if (updated.numUpdatedRows === 0n) {
    return { kind: 'client_not_found' };
  }

  await writeRecords(context.log, [
    {
      kind: pickerSetCodec.kind,
      definitions: context.definitions(),
      payload: pickerSetCodec.encode({ client: shortID }),
    },
  ]);

  return { kind: 'ok' };
}
