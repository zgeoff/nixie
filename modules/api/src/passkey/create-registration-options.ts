import type { ContractOutputs } from '@heynixie/contract';
import { withWriteTransaction } from '@heynixie/log';
import type { PasskeyFailure } from '@heynixie/proposals';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import invariant from 'tiny-invariant';
import { normalizeEnrolmentCode } from '../enrolment/normalize-enrolment-code';
import type { APIContext, Identity } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import type { Assertion } from './challenge-for';
import { checkPasskey } from './check-passkey';
import { parseRegistrationOrigin } from './parse-registration-origin';
import { challengeLifetimeMs, codeLifetimeMs, maxLivePasskeys } from './passkey-state';
import { readAllPasskeys } from './read-all-passkeys';
import { readLivePasskeys } from './read-live-passkeys';

type RegistrationOptions = ContractOutputs['passkeys']['registrationOptions']['options'];

export type RegistrationOptionsResult =
  | { readonly status: 'issued'; readonly options: RegistrationOptions }
  | {
      readonly status:
        | 'origin_unsupported'
        | 'origin_changed'
        | 'too_many'
        | 'code_required'
        | 'code_invalid';
    }
  | { readonly status: 'failed'; readonly reason: PasskeyFailure };

interface RegistrationRequest {
  readonly caller: Identity;
  readonly origin: string | undefined;
  readonly code: string | undefined;
  readonly assertion: Assertion | undefined;
}

// Issues the options for one new passkey. The origin and the cap are checked before the host code
// or the assertion, so a refusal for either leaves the code unused.
export function createRegistrationOptions(
  context: APIContext,
  request: RegistrationRequest,
): Promise<RegistrationOptionsResult> {
  return withWriteTransaction(
    context.log.writer,
    async (tx): Promise<RegistrationOptionsResult> => {
      const parsed = parseRegistrationOrigin(request.origin);

      if (parsed === null) {
        return { status: 'origin_unsupported' };
      }

      const live = await readLivePasskeys(tx);

      if (live.some((row) => row.origin !== parsed.origin)) {
        return { status: 'origin_changed' };
      }

      if (live.length >= maxLivePasskeys) {
        return { status: 'too_many' };
      }

      const now = context.clock.now();
      let authorizedBy = 'code';

      if (request.code !== undefined) {
        const pending = context.passkeys.code.current;

        const isCurrent =
          pending !== null &&
          now - pending.issuedAt < codeLifetimeMs &&
          pending.codeHash === deriveSecretHash(normalizeEnrolmentCode(request.code));

        if (!isCurrent) {
          return { status: 'code_invalid' };
        }

        context.passkeys.code.current = null;
      } else if (request.assertion !== undefined && live.length > 0) {
        const outcome = await checkPasskey(context, tx, {
          caller: request.caller,
          binding: { kind: 'register' },
          assertion: request.assertion,
        });

        if ('error' in outcome) {
          invariant(
            outcome.error === 'PASSKEY_FAILED',
            'a live passkey and an assertion leave only a failed check',
          );

          return { status: 'failed', reason: outcome.reason };
        }

        invariant(outcome.passkeyID !== null, 'an always-ask check never passes on a window');

        authorizedBy = outcome.passkeyID;
      } else {
        return { status: 'code_required' };
      }

      const known = await readAllPasskeys(tx);

      const handles = context.passkeys.userHandle;

      // a stored row's handle wins, and without one every pending first registration shares one
      const userHandle =
        known[0]?.user_handle ?? (handles.current ??= crypto.getRandomValues(new Uint8Array(32)));

      const generated = await generateRegistrationOptions({
        rpName: 'nixie',
        rpID: parsed.rpID,
        userName: 'nixie',
        userDisplayName: 'nixie',
        userID: userHandle,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        attestationType: 'none',
        timeout: challengeLifetimeMs,
        excludeCredentials: live.map((row) => ({ id: row.credential_id })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });

      context.passkeys.registrations.set(request.caller.identityID, {
        challenge: generated.challenge,
        origin: parsed.origin,
        rpID: parsed.rpID,
        userHandle,
        authorizedBy,
        issuedAt: now,
      });

      return {
        status: 'issued',
        options: {
          rp: { id: parsed.rpID, name: 'nixie' },
          user: { id: generated.user.id, name: 'nixie', displayName: 'nixie' },
          challenge: generated.challenge,
          pubKeyCredParams: generated.pubKeyCredParams.map((param) => ({
            type: param.type,
            alg: param.alg,
          })),
          timeout: challengeLifetimeMs,
          excludeCredentials: live.map((row) => ({
            id: row.credential_id,
            type: 'public-key' as const,
          })),
          authenticatorSelection: {
            residentKey: 'required',
            requireResidentKey: true,
            userVerification: 'required',
          },
          attestation: 'none',
        },
      };
    },
  );
}
