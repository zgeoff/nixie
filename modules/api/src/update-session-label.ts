import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { APIContext, APITables } from './types';

interface LabelInput {
  readonly sessionID: string;
  readonly label: string;
}

type LabelResult =
  | { readonly status: 'labelled'; readonly sessionID: string; readonly label: string }
  | { readonly status: 'invalid_label' }
  | { readonly status: 'not_found' };

// Sets the label of a device session that is not revoked, in place of the device name it enrolled
// with, and every message the session sends after it carries the label. The record of the change
// encrypts the label, as the enrolment record encrypts the device name.
export function updateSessionLabel(context: APIContext, input: LabelInput): Promise<LabelResult> {
  const label = normalizeLabel(input.label);

  if (label === null) {
    return Promise.resolve({ status: 'invalid_label' });
  }

  return withWriteTransaction(context.log.writer, async (tx) => {
    const db = tx.$extendTables<APITables>();

    const session = await db
      .selectFrom('identities')
      .select('identity_id')
      .where('identity_id', '=', input.sessionID)
      .where('channel', '=', 'client')
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    if (session === undefined) {
      return { status: 'not_found' };
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'session.labelled',
        definitions: context.definitions(),
        payload: { identityID: input.sessionID },
        erasable: { label },
      },
    ]);

    await db
      .updateTable('identities')
      .set({ label })
      .where('identity_id', '=', input.sessionID)
      .execute();

    return { status: 'labelled', sessionID: input.sessionID, label };
  });
}

// a label renders on one line beside the send time, so each run of white space becomes one space,
// and it keeps to the device name's limit
function normalizeLabel(label: string): string | null {
  const normalized = label.replaceAll(/\s+/gu, ' ').trim();

  return normalized.length === 0 || normalized.length > maxLabelLength ? null : normalized;
}

// the limit the contract sets on the device name a session enrols with
const maxLabelLength = 100;
