import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { APIContext, APITables, SessionScope } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import { readClientAction } from '../utils/read-client-action';
import { sessionHooks } from '../utils/session-hooks';
import { writeClientAction } from '../utils/write-client-action';
import { createSecret } from './create-secret';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';

interface EnrolInput {
  readonly clientActionID: string;
  readonly code: string;
  readonly deviceName: string;
  readonly tokenDelivery: 'cookie' | 'bearer';
}

type EnrolResult =
  | {
      readonly status: 'enrolled';
      readonly sessionID: string;
      readonly token: string;
      readonly scope: SessionScope;
    }
  | { readonly status: 'invalid' }
  | { readonly status: 'reused' };

export function claimEnrolmentCode(context: APIContext, input: EnrolInput): Promise<EnrolResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const code = normalizeEnrolmentCode(input.code);
    const codeHash = deriveSecretHash(code);

    const inputHash = buildInputHash({
      code,
      deviceName: input.deviceName,
      tokenDelivery: input.tokenDelivery,
    });

    const earlier = await readClientAction(tx, input.clientActionID);

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
    .select(['issued_by', 'scope'])
    .where('code_hash', '=', pending.codeHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', context.clock.now())
    .executeTakeFirst();

  // a code for a device scope outlives a switch of the devices feature off, and then claims nothing
  if (code === undefined || (code.scope === 'device' && !context.features.includes('devices'))) {
    return { status: 'invalid' };
  }

  const session = await writeSession(tx, context, {
    deviceName: pending.input.deviceName,
    issuedBy: code.issued_by,
    scope: code.scope,
  });

  for (const hook of sessionHooks.list()) {
    await hook.onEnrolled?.(
      tx,
      { identityID: session.sessionID, name: pending.input.deviceName, scope: code.scope },
      context.clock.now(),
    );
  }

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
  readonly scope: SessionScope;
}

async function writeSession(
  tx: Transaction<unknown>,
  context: APIContext,
  session: NewSession,
): Promise<{ readonly sessionID: string; readonly token: string; readonly scope: SessionScope }> {
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
      scope: session.scope,
    })
    .execute();

  return { sessionID, token, scope: session.scope };
}

interface EnrolmentRetry {
  readonly codeHash: string;
  readonly sessionID: string;
}

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
    .returning('scope')
    .executeTakeFirst();

  return updated === undefined
    ? { status: 'invalid' }
    : { status: 'enrolled', sessionID: retry.sessionID, token, scope: updated.scope };
}
