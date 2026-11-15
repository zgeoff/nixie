import { writeRecordsInTransaction } from '@heynixie/log';
import type { PasskeyFailure } from '@heynixie/proposals';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables, Identity } from '../types';
import { buildCanonicalBinding } from './build-canonical-binding';
import type { Assertion, ChallengeFor } from './challenge-for';
import type { AuthenticatorData } from './parse-authenticator-data';
import { parseAuthenticatorData } from './parse-authenticator-data';
import { parseClientData } from './parse-client-data';
import type { PendingChallenge } from './passkey-state';
import { challengeLifetimeMs } from './passkey-state';
import { toAuthenticationResponse } from './to-authentication-response';
import { toBindingPayload } from './to-binding-payload';

export type PasskeyVerdict =
  | { readonly passkeyID: string }
  | { readonly error: 'PASSKEY_FAILED'; readonly reason: PasskeyFailure };

// The one check every passkey-gated path calls, inside its write transaction.
export interface PasskeyCheck {
  readonly verify: (
    tx: Transaction<unknown>,
    caller: Identity,
    binding: ChallengeFor,
    assertion: Assertion,
  ) => Promise<PasskeyVerdict>;
}

export function createPasskeyCheck(context: APIContext): PasskeyCheck {
  return {
    verify: async (tx, caller, binding, assertion) => {
      // The first verification of a challenge, passed or failed, removes it.
      const challenge = takeChallenge(context, caller, assertion);

      const row = await readRow(tx, assertion.id);

      if (row === undefined) {
        return fail('unknown_passkey');
      }

      if (challenge === null) {
        return fail('unknown_challenge');
      }

      if (buildCanonicalBinding(challenge.pending.binding) !== buildCanonicalBinding(binding)) {
        return fail('binding');
      }

      const authenticatorData = parseAuthenticatorData(assertion.response.authenticatorData);
      const clientData = parseClientData(assertion.response.clientDataJSON);

      if (authenticatorData === null || clientData === null) {
        return fail('signature');
      }

      const refusal = pickRefusal(row, { authenticatorData, origin: clientData.origin });

      if (refusal !== null) {
        return fail(refusal);
      }

      const isVerified = await probeSignature(row, { assertion, challenge: challenge.value });

      if (!isVerified) {
        return fail('signature');
      }

      await tx
        .$extendTables<APITables>()
        .updateTable('passkeys')
        .set({
          sign_count: authenticatorData.counter,
          backed_up: authenticatorData.isBackedUp ? 1 : 0,
          last_used_at: context.clock.now(),
        })
        .where('passkey_id', '=', row.passkey_id)
        .execute();

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'passkey.used',
          definitions: context.definitions(),
          payload: { passkeyID: row.passkey_id, binding: toBindingPayload(binding) },
        },
      ]);

      return { passkeyID: row.passkey_id };
    },
  };
}

interface TakenChallenge {
  readonly value: string;
  readonly pending: PendingChallenge;
}

function takeChallenge(
  context: APIContext,
  caller: Identity,
  assertion: Assertion,
): TakenChallenge | null {
  const clientData = parseClientData(assertion.response.clientDataJSON);

  if (clientData === null) {
    return null;
  }

  const pending = context.passkeys.challenges.get(clientData.challenge);

  // A challenge of another session stays for the session that asked.
  if (pending === undefined || pending.identityID !== caller.identityID) {
    return null;
  }

  context.passkeys.challenges.delete(clientData.challenge);

  const isLapsed = context.clock.now() - pending.issuedAt >= challengeLifetimeMs;

  return isLapsed ? null : { value: clientData.challenge, pending };
}

// The live passkey that holds the credential, or undefined for an unknown or revoked one.
function readRow(tx: Transaction<unknown>, credentialID: string) {
  return tx
    .$extendTables<APITables>()
    .selectFrom('passkeys')
    .selectAll()
    .where('credential_id', '=', credentialID)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
}

function fail(reason: PasskeyFailure): PasskeyVerdict {
  return { error: 'PASSKEY_FAILED', reason };
}

interface StoredPasskey {
  readonly origin: string;
  readonly rp_id: string;
  readonly sign_count: number;
}

interface PasskeyEvidence {
  readonly authenticatorData: AuthenticatorData;
  readonly origin: string;
}

function pickRefusal(
  row: StoredPasskey,
  evidence: PasskeyEvidence,
): 'origin' | 'no_user_verification' | 'counter' | null {
  const data = evidence.authenticatorData;

  const rpIDHash = new Bun.CryptoHasher('sha256').update(row.rp_id).digest('hex');

  if (evidence.origin !== row.origin || data.rpIDHash !== rpIDHash) {
    return 'origin';
  }

  if (!data.isUserVerified) {
    return 'no_user_verification';
  }

  const isCounterStuck = (data.counter > 0 || row.sign_count > 0) && data.counter <= row.sign_count;

  return isCounterStuck ? 'counter' : null;
}

const transportsSchema = z.array(z.string());

type PasskeyRow = Awaited<ReturnType<typeof readRow>>;

interface SignatureRequest {
  readonly assertion: Assertion;
  readonly challenge: string;
}

// The library reports a bad signature as an unverified result, and every other defect as a throw.
async function probeSignature(
  row: NonNullable<PasskeyRow>,
  request: SignatureRequest,
): Promise<boolean> {
  try {
    const result = await verifyAuthenticationResponse({
      response: toAuthenticationResponse(request.assertion),
      expectedChallenge: request.challenge,
      expectedOrigin: row.origin,
      expectedRPID: row.rp_id,
      requireUserVerification: true,
      credential: {
        id: row.credential_id,
        publicKey: row.public_key,
        counter: row.sign_count,
        transports: transportsSchema.parse(JSON.parse(row.transports)),
      },
    });

    return result.verified;
  } catch {
    return false;
  }
}
