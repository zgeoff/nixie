import { z } from 'zod';
import { featureOffErrors } from './feature-off-errors';
import { forgetBackupSchema } from './forget-backup-schema';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const connectionsProcedure = signedIn.errors(featureOffErrors).errors({
  CONNECTIONS_NOT_STARTED: {
    message: 'nixie has not started its connections yet; try again in a moment',
    status: 503,
  },
});

const checkedAction = connectionsProcedure.errors(reusedIDErrors);
const connectorSchema = z.literal('google');
const clientNotFound = { message: 'No registered client has this ID', status: 404 } as const;
const connectionNotFound = { message: 'No connection has this ID', status: 404 } as const;
const erasureSchema = z.enum(['pending', 'done']);
const revocationSchema = z.enum(['pending', 'confirmed', 'refused', 'unknown', 'not_attempted']);

const missingScopeSchema = z.object({
  scope: z.string(),
  reason: z.enum(['not_granted', 'api_disabled']),
});

const linkSchema = z.object({ label: z.string(), url: z.string() });

const setupStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  links: z.array(linkSchema),
  input: z.literal('oauth_client').optional(),
});

const registeredClientSchema = z.object({
  client: z.string(),
  clientID: z.string(),
  origin: z.string(),
  redirectURI: z.string(),
  fingerprint: z.string(),
  pickerKey: z.string().nullable(),
  projectNumber: z.string().nullable(),
});

const forgetStatusSchema = z.object({
  erasure: erasureSchema,
  revocation: revocationSchema,
  backup: forgetBackupSchema,
});

const listedConnectionSchema = z.object({
  connection: z.string(),
  connector: z.string(),

  // null for a forgotten connection
  label: z.string().nullable(),
  account: z.string().nullable(),
  status: z.enum(['active', 'failing', 'needs_consent', 'expiring', 'forgotten']),
  reason: z.enum(['unauthorised', 'service_error', 'no_answer']).nullable(),
  statusSince: z.date(),
  lastSuccessAt: z.date().nullable(),
  scopes: z.array(z.string()),
  missing: z.array(missingScopeSchema),
  fingerprint: z.string().nullable(),

  // null while the connection lives
  forget: forgetStatusSchema.nullable(),
});

const shortIDSchema = z.string().min(1).max(100);
const shortIDsSchema = z.array(shortIDSchema).min(1).max(50);
const listedForgetSchema = forgetStatusSchema.extend({ connection: z.string() });
const pickerKeySchema = z.string().min(1).max(200);

const pickedFileSchema = z.object({
  file: z.string(),

  // null when nixie cannot see the file
  name: z.string().nullable(),
  isVisible: z.boolean(),
});

const pickedInputSchema = z.object({
  connection: shortIDSchema,
  files: z.array(z.string().min(1).max(200)).min(1).max(50),
});

const projectNumberSchema = z.string().regex(/^\d{4,20}$/u);

export const connectionsContract = {
  readSetup: connectionsProcedure
    .input(z.object({ connector: connectorSchema, origin: z.string().min(1).max(2048) }))
    .output(
      z.object({ steps: z.array(setupStepSchema), client: registeredClientSchema.nullable() }),
    ),

  registerClient: checkedAction
    .errors({
      INVALID_ORIGIN: {
        message:
          'The origin must be https, with no path, query or user name, and the same as the page that sent it',
        status: 400,
      },
      CLIENT_EXISTS: { message: 'This connector has a registered client already', status: 409 },
    })
    .input(
      z.object({
        clientActionID: z.uuid(),
        connector: connectorSchema,
        clientID: z.string().min(1).max(500),
        clientSecret: z.string().min(1).max(500),
        origin: z.string().min(1).max(2048),
        pickerKey: pickerKeySchema.optional(),
        projectNumber: projectNumberSchema.optional(),
      }),
    )
    .output(z.object({ client: z.string(), redirectURI: z.string() })),

  setPicker: checkedAction
    .errors({ CLIENT_NOT_FOUND: clientNotFound })
    .input(
      z
        .object({
          clientActionID: z.uuid(),
          client: shortIDSchema,

          // both values, or null for both to remove them
          pickerKey: pickerKeySchema.nullable(),
          projectNumber: projectNumberSchema.nullable(),
        })
        .refine((input) => (input.pickerKey === null) === (input.projectNumber === null), {
          message: 'Give both the picker key and the project number, or neither',
        }),
    )
    .output(z.object({})),

  removeClient: checkedAction
    .errors({
      CLIENT_NOT_FOUND: clientNotFound,
      CLIENT_IN_USE: {
        message: 'A connection or a consent that has not lapsed uses this client',
        status: 409,
      },
    })
    .input(z.object({ clientActionID: z.uuid(), client: shortIDSchema }))
    .output(z.object({})),

  startConsent: checkedAction
    .errors({
      CLIENT_MISSING: {
        message: 'Register an OAuth client before you connect an account',
        status: 409,
      },
      CONNECTION_NOT_FOUND: connectionNotFound,
    })
    .input(
      z.object({
        clientActionID: z.uuid(),
        connector: connectorSchema,

        // null for a new account; a connection's short ID to consent again
        connection: shortIDSchema.nullable(),
      }),
    )
    .output(z.object({ consentURL: z.string(), expiresAt: z.date() })),

  finishConsent: connectionsProcedure
    .errors({
      CONSENT_NOT_FOUND: {
        message: 'This consent is unknown, used, lapsed, or was started by another session',
        status: 404,
      },
      CONSENT_REFUSED: { message: 'The provider did not grant the consent', status: 400 },
      TOKEN_EXCHANGE_FAILED: {
        message: 'The provider refused the code',
        status: 502,
        data: z.object({ providerError: z.string().nullable() }),
      },
      NO_REFRESH_TOKEN: { message: 'The provider returned no refresh token', status: 502 },
      ACCOUNT_MISMATCH: {
        message: 'The account is not the one this connection reaches',
        status: 409,
      },
      FORGET_IN_PROGRESS: {
        message: 'This account is being forgotten. Consent again later',
        status: 409,
      },
    })
    .input(
      z.object({
        state: z.string().min(1).max(500),
        code: z.string().min(1).max(2000).nullable(),
        error: z.string().max(500).nullable(),
      }),
    )
    .output(z.object({ connection: z.string(), missing: z.array(missingScopeSchema) })),

  list: connectionsProcedure.output(z.array(listedConnectionSchema)),

  forget: checkedAction
    .errors({ CONNECTION_NOT_FOUND: connectionNotFound })
    .input(z.object({ clientActionID: z.uuid(), connection: shortIDSchema }))
    .output(forgetStatusSchema),

  checkPicked: connectionsProcedure
    .errors({ CONNECTION_NOT_FOUND: connectionNotFound })
    .input(pickedInputSchema)
    .output(z.array(pickedFileSchema)),

  readForgetStatus: connectionsProcedure
    .errors({ CONNECTION_NOT_FOUND: connectionNotFound })
    .input(z.object({ connections: shortIDsSchema }))
    .output(z.array(listedForgetSchema)),
};
