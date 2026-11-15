import { z } from 'zod';
import { authenticationResponseSchema } from './authentication-response-schema';
import { challengeForSchema } from './challenge-for-schema';
import { creationOptionsSchema } from './creation-options-schema';
import { noPasskeyError } from './no-passkey-error';
import { passkeyFailedError } from './passkey-failed-error';
import { registrationResponseSchema } from './registration-response-schema';
import { requestOptionsSchema } from './request-options-schema';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const clientActionIDSchema = z.uuid();

const listedPasskeySchema = z.object({
  passkeyID: z.string(),
  label: z.string(),
  synced: z.boolean(),
  authorizedBy: z.string(),
  registeredAt: z.date(),
  lastUsedAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
});

const registrationErrors = {
  ...passkeyFailedError,
  TOO_MANY_PASSKEYS: { message: 'Ten passkeys are live already', status: 409 },
  ORIGIN_UNSUPPORTED: {
    message: 'A passkey needs an https origin with a domain name',
    status: 400,
  },
  ORIGIN_CHANGED: { message: 'Live passkeys hold another origin', status: 409 },
};

export const passkeyContract = {
  challenge: signedIn
    .errors(noPasskeyError)
    .input(z.object({ for: challengeForSchema }))
    .output(z.object({ options: requestOptionsSchema })),

  registrationOptions: signedIn
    .errors(registrationErrors)
    .errors({
      CODE_REQUIRED: { message: 'A host code is required', status: 403 },
      CODE_INVALID: { message: 'The host code is unknown, used or lapsed', status: 403 },
    })
    .input(
      z.object({
        code: z.string().min(1).max(100).optional(),
        passkey: authenticationResponseSchema.optional(),
      }),
    )
    .output(z.object({ options: creationOptionsSchema })),

  register: signedIn
    .errors(reusedIDErrors)
    .errors({
      REGISTRATION_FAILED: {
        message: 'The registration failed',
        status: 400,
        data: z.object({ reason: z.string() }),
      },
      TOO_MANY_PASSKEYS: registrationErrors.TOO_MANY_PASSKEYS,
      ORIGIN_UNSUPPORTED: registrationErrors.ORIGIN_UNSUPPORTED,
    })
    .input(
      z.object({
        clientActionID: clientActionIDSchema,
        response: registrationResponseSchema,
        label: z.string().min(1).max(64).optional(),
      }),
    )
    .output(z.object({ passkeyID: z.string() })),

  list: signedIn.output(z.object({ passkeys: z.array(listedPasskeySchema) })),

  revoke: signedIn
    .errors(reusedIDErrors)
    .errors(passkeyFailedError)
    .errors({ NOT_FOUND: { message: 'No passkey has this ID', status: 404 } })
    .input(
      z.object({
        clientActionID: clientActionIDSchema,
        passkeyID: z.string().min(1).max(200),
        passkey: authenticationResponseSchema,
      }),
    )
    .output(z.object({ revokedAt: z.date() })),
};
