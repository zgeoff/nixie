import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildInputHash } from './build-input-hash';
import type { ClientAction } from './find-client-action';
import { findClientAction } from './find-client-action';
import { isLiveIdentity } from './is-live-identity';
import { sessionRevokedCodec } from './session-revoked-codec';
import type { APIContext, APITables, Identity } from './types';
import { writeClientAction } from './write-client-action';

interface RevocationInput {
  readonly clientActionID: string;
  readonly sessionID: string;
}

type RevocationResult =
  | { readonly status: 'revoked'; readonly revokedAt: number }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// Revokes a device session, a checked action of a signed-in device. The revoked row keeps its
// token hash, so a later call with the token resolves to the row and is refused. Revoking a revoked
// session answers with the first revocation's time and changes nothing.
export function writeSessionRevocation(
  context: APIContext,
  caller: Identity,
  input: RevocationInput,
): Promise<RevocationResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      isLiveIdentity(tx, context, caller.identityID),
      findClientAction(tx, input.clientActionID),
    ]);

    const inputHash = buildInputHash({ sessionID: input.sessionID });
    const settled = pickSettledRevocation({ live, earlier, inputHash });

    if (settled !== null) {
      return settled;
    }

    const revokedAt = await updateRevokedAt(tx, context, { caller, sessionID: input.sessionID });

    if (revokedAt === null) {
      return { status: 'not_found' };
    }

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure: 'sessions.revoke',
      identityID: caller.identityID,
      inputHash,
      result: { revokedAt },
      recordedAt: context.clock.now(),
    });

    return { status: 'revoked', revokedAt };
  });
}

interface RevocationState {
  readonly live: boolean;
  readonly earlier: ClientAction | null;
  readonly inputHash: string;
}

// the answer a call gets without a write: refused for a caller no longer live, and for an ID that
// came before, its first result or a refusal as reused
function pickSettledRevocation(state: RevocationState): RevocationResult | null {
  if (!state.live) {
    return { status: 'unauthorized' };
  }

  if (state.earlier === null) {
    return null;
  }

  return state.earlier.procedure === 'sessions.revoke' &&
    state.earlier.inputHash === state.inputHash
    ? { status: 'revoked', revokedAt: Number(state.earlier.result['revokedAt']) }
    : { status: 'reused' };
}

interface Revocation {
  readonly caller: Identity;
  readonly sessionID: string;
}

// revokes the session if it is live and answers its revocation time, or null when no session has
// the ID
async function updateRevokedAt(
  tx: Transaction<unknown>,
  context: APIContext,
  revocation: Revocation,
): Promise<number | null> {
  const db = tx.$extendTables<APITables>();

  const session = await db
    .selectFrom('identities')
    .select('revoked_at')
    .where('identity_id', '=', revocation.sessionID)
    .where('channel', '=', 'client')
    .executeTakeFirst();

  if (session === undefined) {
    return null;
  }

  if (session.revoked_at !== null) {
    return session.revoked_at;
  }

  const revokedAt = context.clock.now();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: sessionRevokedCodec.kind,
      definitions: context.definitions(),
      payload: sessionRevokedCodec.encode({
        identityID: revocation.sessionID,
        revokedBy: revocation.caller.identityID,
      }),
    },
  ]);

  await db
    .updateTable('identities')
    .set({ revoked_at: revokedAt })
    .where('identity_id', '=', revocation.sessionID)
    .execute();

  return revokedAt;
}
