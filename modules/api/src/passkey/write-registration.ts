import type { ContractInputs } from '@heynixie/contract';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { APIContext, APITables, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import { challengeLifetimeMs, maxLivePasskeys } from './passkey-state';
import { readLivePasskeys } from './read-live-passkeys';

type RegistrationInput = ContractInputs['passkeys']['register'];

export type RegistrationResult =
  | { readonly status: 'registered'; readonly passkeyID: string }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'too_many' }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

const maxLabelLength = 64;

// Adds the passkey that the asking session's options allowed. The options work once, so a failed
// verification removes them.
export async function writeRegistration(
  context: APIContext,
  caller: Identity,
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const inputHash = buildInputHash({ credentialID: input.response.id, label: input.label ?? null });

  const earlier = await readClientAction(context.log.writer.db, input.clientActionID);

  if (earlier !== null) {
    return earlier.procedure === 'passkeys.register' &&
      earlier.identityID === caller.identityID &&
      earlier.inputHash === inputHash
      ? { status: 'registered', passkeyID: String(earlier.result['passkeyID']) }
      : { status: 'reused' };
  }

  const pending = context.passkeys.registrations.get(caller.identityID);

  context.passkeys.registrations.delete(caller.identityID);

  if (pending === undefined || context.clock.now() - pending.issuedAt >= challengeLifetimeMs) {
    return { status: 'failed', reason: 'unknown_options' };
  }

  const verified = await verifyResponse(toRegistrationResponse(input.response), pending);

  if (verified === null) {
    return { status: 'failed', reason: 'verification' };
  }

  return withWriteTransaction(context.log.writer, async (tx): Promise<RegistrationResult> => {
    if (!(await probeLiveIdentity(tx, context, caller.identityID))) {
      return { status: 'unauthorized' };
    }

    const live = await readLivePasskeys(tx);

    if (live.length >= maxLivePasskeys) {
      return { status: 'too_many' };
    }

    if (live.some((row) => row.origin !== pending.origin)) {
      return { status: 'failed', reason: 'origin_changed' };
    }

    // a revoke that committed before this write leaves the authorizing passkey dead
    if (
      pending.authorizedBy !== 'code' &&
      !live.some((row) => row.passkey_id === pending.authorizedBy)
    ) {
      return { status: 'failed', reason: 'authorizing_passkey_revoked' };
    }

    if (live.some((row) => row.credential_id === verified.credential.id)) {
      return { status: 'failed', reason: 'duplicate' };
    }

    const passkeyID = crypto.randomUUID();
    const now = context.clock.now();

    const label = (input.label ?? (caller.label === '' ? 'Passkey' : caller.label)).slice(
      0,
      maxLabelLength,
    );

    await tx
      .$extendTables<APITables>()
      .insertInto('passkeys')
      .values({
        passkey_id: passkeyID,
        credential_id: verified.credential.id,
        public_key: verified.credential.publicKey,
        user_handle: pending.userHandle,
        rp_id: pending.rpID,
        origin: pending.origin,
        sign_count: verified.credential.counter,
        backup_eligible: verified.credentialDeviceType === 'multiDevice' ? 1 : 0,
        backed_up: verified.credentialBackedUp ? 1 : 0,
        transports: JSON.stringify(input.response.response.transports ?? []),
        aaguid: verified.aaguid,
        label,
        registered_by: caller.identityID,
        authorized_by: pending.authorizedBy,
        registered_at: now,
        last_used_at: null,
        revoked_at: null,
      })
      .execute();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'passkey.registered',
        definitions: context.definitions(),
        payload: {
          passkeyID,
          registeredBy: caller.identityID,
          authorizedBy: pending.authorizedBy,
        },
        erasable: { label },
      },
    ]);

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure: 'passkeys.register',
      identityID: caller.identityID,
      inputHash,
      result: { passkeyID },
      recordedAt: now,
    });

    return { status: 'registered', passkeyID };
  });
}

interface PendingRegistration {
  readonly challenge: string;
  readonly origin: string;
  readonly rpID: string;
}

async function verifyResponse(response: RegistrationResponseJSON, pending: PendingRegistration) {
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: pending.origin,
      expectedRPID: pending.rpID,
      requireUserVerification: true,
    });

    return result.verified ? result.registrationInfo : null;
  } catch {
    return null;
  }
}

function toRegistrationResponse(response: RegistrationInput['response']): RegistrationResponseJSON {
  const inner = response.response;

  return {
    id: response.id,
    rawId: response.rawId,
    type: response.type,

    // verification reads no client extension result
    clientExtensionResults: {},
    response: {
      clientDataJSON: inner.clientDataJSON,
      attestationObject: inner.attestationObject,
      ...(inner.authenticatorData === undefined
        ? {}
        : { authenticatorData: inner.authenticatorData }),
      ...(inner.transports === undefined ? {} : { transports: inner.transports }),
      ...(inner.publicKeyAlgorithm === undefined
        ? {}
        : { publicKeyAlgorithm: inner.publicKeyAlgorithm }),
      ...(inner.publicKey === undefined ? {} : { publicKey: inner.publicKey }),
    },
    ...(response.authenticatorAttachment === undefined
      ? {}
      : { authenticatorAttachment: response.authenticatorAttachment }),
  };
}
