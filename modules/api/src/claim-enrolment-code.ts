import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { buildInputHash } from './build-input-hash';
import { createSecret } from './create-secret';
import { deriveSecretHash } from './derive-secret-hash';
import { findClientAction } from './find-client-action';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';
import type { APIContext, APITables } from './types';
import { writeClientAction } from './write-client-action';

interface EnrolInput {
  readonly clientActionID: string;
  readonly code: string;
  readonly deviceName: string;
  readonly tokenDelivery: 'cookie' | 'bearer';
}

type EnrolResult =
  | { readonly status: 'enrolled'; readonly sessionID: string; readonly token: string }
  | { readonly status: 'invalid' }
  | { readonly status: 'reused' };

// Uses an enrolment code once, before it lapses, to start a device session keyed by a new token's
// hash. nixie keeps only that hash, so a retry before the code lapses answers with the same session
// and a fresh token that replaces the first.
export function claimEnrolmentCode(context: APIContext, input: EnrolInput): Promise<EnrolResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const code = normalizeEnrolmentCode(input.code);
    const codeHash = deriveSecretHash(code);

    const inputHash = buildInputHash({
      code,
      deviceName: input.deviceName,
      tokenDelivery: input.tokenDelivery,
    });

    const earlier = await findClientAction(tx, input.clientActionID);

    if (earlier === null) {
      return writeEnrolment(tx, context, { input, codeHash, inputHash });
    }

    if (earlier.procedure !== 'sessions.enrol' || earlier.inputHash !== inputHash) {
      return { status: 'reused' };
    }

    return updateEnrolmentToken(tx, context, {
      codeHash,
      sessionID: String(earlier.result['sessionID']),
    });
  });
}

interface PendingEnrolment {
  readonly input: EnrolInput;
  readonly codeHash: string;
  readonly inputHash: string;
}

async function writeEnrolment(
  tx: Transaction<unknown>,
  context: APIContext,
  pending: PendingEnrolment,
): Promise<EnrolResult> {
  const code = await tx
    .$extendTables<APITables>()
    .selectFrom('enrolment_codes')
    .select(['issued_by'])
    .where('code_hash', '=', pending.codeHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', context.clock.now())
    .executeTakeFirst();

  if (code === undefined) {
    return { status: 'invalid' };
  }

  const session = await writeSession(tx, context, {
    deviceName: pending.input.deviceName,
    issuedBy: code.issued_by,
  });

  await tx
    .$extendTables<APITables>()
    .updateTable('enrolment_codes')
    .set({ used_at: context.clock.now(), identity_id: session.sessionID })
    .where('code_hash', '=', pending.codeHash)
    .execute();

  await writeClientAction(tx, {
    clientActionID: pending.input.clientActionID,
    procedure: 'sessions.enrol',
    identityID: null,
    inputHash: pending.inputHash,
    result: { sessionID: session.sessionID },
    recordedAt: context.clock.now(),
  });

  return { status: 'enrolled', ...session };
}

interface NewSession {
  readonly deviceName: string;
  readonly issuedBy: string | null;
}

// a device session is one row of the identity record, whose external ID is its own ID
async function writeSession(
  tx: Transaction<unknown>,
  context: APIContext,
  session: NewSession,
): Promise<{ readonly sessionID: string; readonly token: string }> {
  const sessionID = crypto.randomUUID();
  const token = createSecret('session-token');

  const [record] = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'session.enrolled',
      definitions: context.definitions(),
      payload: { identityID: sessionID, channel: 'client', issuedBy: session.issuedBy },
      erasable: { label: session.deviceName },
    },
  ]);

  invariant(record, 'the log wrote no session.enrolled record');

  await tx
    .$extendTables<APITables>()
    .insertInto('identities')
    .values({
      identity_id: sessionID,
      channel: 'client',
      external_id: sessionID,
      label: session.deviceName,
      token_hash: deriveSecretHash(token),
      paired_at: context.clock.now(),
      last_seen_at: context.clock.now(),
      revoked_at: null,
      paired_sequence: record.sequence,
    })
    .execute();

  return { sessionID, token };
}

interface EnrolmentRetry {
  readonly codeHash: string;
  readonly sessionID: string;
}

// a retry works only while the code it used would still work, and never revives a revoked session
async function updateEnrolmentToken(
  tx: Transaction<unknown>,
  context: APIContext,
  retry: EnrolmentRetry,
): Promise<EnrolResult> {
  const db = tx.$extendTables<APITables>();

  const code = await db
    .selectFrom('enrolment_codes')
    .select('code_hash')
    .where('code_hash', '=', retry.codeHash)
    .where('identity_id', '=', retry.sessionID)
    .where('expires_at', '>', context.clock.now())
    .executeTakeFirst();

  if (code === undefined) {
    return { status: 'invalid' };
  }

  const token = createSecret('session-token');

  const updated = await db
    .updateTable('identities')
    .set({ token_hash: deriveSecretHash(token) })
    .where('identity_id', '=', retry.sessionID)
    .where('revoked_at', 'is', null)
    .returning('identity_id')
    .executeTakeFirst();

  return updated === undefined
    ? { status: 'invalid' }
    : { status: 'enrolled', sessionID: retry.sessionID, token };
}
