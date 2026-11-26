// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type {
  RegisterClientResult,
  RemoveClientResult,
  SetPickerResult,
  StartConsentResult,
} from '@heynixie/connections';
import type { JSONObject } from '@heynixie/log';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { runCheckedAction } from '../utils/run-checked-action';
import { readContractForgetStatus } from './read-contract-forget-status';
import { readListedConnection } from './read-listed-connection';

// What a checked action stores: its data, or the code of the refusal it ended with.
const refusedSchema = z.object({ error: z.string() });
const clientSchema = z.object({ client: z.string(), redirectURI: z.string() });
const consentSchema = z.object({ consentID: z.string(), expiresAt: z.number() });

const forgetSchema = z.object({
  erasure: z.enum(['pending', 'done']),
  revocation: z.enum(['pending', 'confirmed', 'refused', 'unknown', 'not_attempted']),
  finishedSequence: z.number().nullable(),
});

export function createConnectionProcedures(context: APIContext) {
  const connections = apiImplementer.connections;

  const requirePort = (buildNotStarted: () => Error) => {
    const port = context.readConnections?.() ?? null;

    if (port === null) {
      throw buildNotStarted();
    }

    return port;
  };

  return {
    readSetup: connections.readSetup.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);

      const setup = await port.readSetup(options.input.origin);

      const steps = setup.steps.map((step) => ({
        id: step.id,
        title: step.title,
        body: step.body,
        links: step.links.map((link) => ({ label: link.label, url: link.url })),
        input: step.input,
      }));

      return { client: setup.client, steps };
    }),

    registerClient: connections.registerClient.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);
      const input = options.input;

      const run = await runCheckedAction(
        context,
        caller,
        {
          procedure: 'connections.registerClient',
          clientActionID: input.clientActionID,
          input: {
            connector: input.connector,
            clientID: input.clientID,
            clientSecret: input.clientSecret,
            origin: input.origin,
            pickerKey: input.pickerKey ?? null,
            projectNumber: input.projectNumber ?? null,
          },
          omit: ['clientSecret'],
        },
        async (attempt) => {
          const result = await port.registerClient(
            {
              clientID: input.clientID,
              clientSecret: input.clientSecret,
              origin: input.origin,
              headerOrigin: options.context.origin,
              pickerKey: input.pickerKey ?? null,
              projectNumber: input.projectNumber ?? null,
            },
            {
              isRetry: attempt.isRetry,
              settle: (tx, settled) => attempt.writeResult(tx, toRegisterClientResult(settled)),
            },
          );

          return toRegisterClientResult(result);
        },
      );

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      const refused = refusedSchema.safeParse(run.result);

      if (refused.success) {
        throw refused.data.error === 'invalid_origin'
          ? options.errors.INVALID_ORIGIN()
          : options.errors.CLIENT_EXISTS();
      }

      return clientSchema.parse(run.result);
    }),

    setPicker: connections.setPicker.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);
      const input = options.input;

      const run = await runCheckedAction(
        context,
        caller,
        {
          procedure: 'connections.setPicker',
          clientActionID: input.clientActionID,
          input: {
            client: input.client,
            pickerKey: input.pickerKey,
            projectNumber: input.projectNumber,
          },
        },
        async (attempt) => {
          const picker =
            input.pickerKey === null || input.projectNumber === null
              ? null
              : { pickerKey: input.pickerKey, projectNumber: input.projectNumber };

          const result = await port.setPicker(input.client, picker, {
            isRetry: attempt.isRetry,
            settle: (tx, settled) => attempt.writeResult(tx, toSetPickerResult(settled)),
          });

          return toSetPickerResult(result);
        },
      );

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (refusedSchema.safeParse(run.result).success) {
        throw options.errors.CLIENT_NOT_FOUND();
      }

      return {};
    }),

    removeClient: connections.removeClient.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);
      const input = options.input;

      const run = await runCheckedAction(
        context,
        caller,
        {
          procedure: 'connections.removeClient',
          clientActionID: input.clientActionID,
          input: { client: input.client },
        },
        async (attempt) => {
          const result = await port.removeClient(input.client, {
            isRetry: attempt.isRetry,
            settle: (tx, settled) => attempt.writeResult(tx, toRemoveClientResult(settled)),
          });

          return toRemoveClientResult(result);
        },
      );

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      const refused = refusedSchema.safeParse(run.result);

      if (refused.success) {
        throw refused.data.error === 'client_in_use'
          ? options.errors.CLIENT_IN_USE()
          : options.errors.CLIENT_NOT_FOUND();
      }

      return {};
    }),

    startConsent: connections.startConsent.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);
      const input = options.input;
      const started: { url: string | null } = { url: null };

      const run = await runCheckedAction(
        context,
        caller,
        {
          procedure: 'connections.startConsent',
          clientActionID: input.clientActionID,
          input: { connector: input.connector, connection: input.connection },
        },
        async (attempt) => {
          const result = await port.startConsent(
            { deviceSessionID: caller.identityID, connection: input.connection },
            {
              isRetry: attempt.isRetry,
              settle: (tx, settled) => attempt.writeResult(tx, toStartConsentResult(settled)),
            },
          );

          if (result.kind === 'started') {
            started.url = result.consentURL;
          }

          return toStartConsentResult(result);
        },
      );

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      const refused = refusedSchema.safeParse(run.result);

      if (refused.success) {
        throw refused.data.error === 'client_missing'
          ? options.errors.CLIENT_MISSING()
          : options.errors.CONNECTION_NOT_FOUND();
      }

      const consent = consentSchema.parse(run.result);

      // A retry gets a fresh state and URL that replace the first ones, with the expiry of the
      // request that the URL belongs to.
      if (started.url !== null) {
        return { consentURL: started.url, expiresAt: new Date(consent.expiresAt) };
      }

      const again = await port.startConsent({
        deviceSessionID: caller.identityID,
        connection: input.connection,
        consentID: consent.consentID,
      });

      if (again.kind !== 'started') {
        throw again.kind === 'client_missing'
          ? options.errors.CLIENT_MISSING()
          : options.errors.CONNECTION_NOT_FOUND();
      }

      return { consentURL: again.consentURL, expiresAt: new Date(again.expiresAt) };
    }),

    finishConsent: connections.finishConsent.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);

      const result = await port.finishConsent({
        deviceSessionID: caller.identityID,
        state: options.input.state,
        code: options.input.code,
        error: options.input.error,
      });

      return match(result)
        .with({ kind: 'finished' }, (finished) => ({
          connection: finished.connection,
          missing: [...finished.missing],
        }))
        .with({ kind: 'consent_refused' }, () => {
          throw options.errors.CONSENT_REFUSED();
        })
        .with({ kind: 'token_exchange_failed' }, (failed) => {
          throw options.errors.TOKEN_EXCHANGE_FAILED({ data: { googleError: failed.googleError } });
        })
        .with({ kind: 'no_refresh_token' }, () => {
          throw options.errors.NO_REFRESH_TOKEN();
        })
        .with({ kind: 'account_mismatch' }, () => {
          throw options.errors.ACCOUNT_MISMATCH();
        })
        .with({ kind: 'forget_in_progress' }, () => {
          throw options.errors.FORGET_IN_PROGRESS();
        })
        .with({ kind: 'consent_not_found' }, () => {
          throw options.errors.CONSENT_NOT_FOUND();
        })
        .exhaustive();
    }),

    list: connections.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);

      const listed = await port.list();

      return Promise.all(listed.map((entry) => readListedConnection(context, entry)));
    }),

    forget: connections.forget.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);
      const input = options.input;

      const run = await runCheckedAction(
        context,
        caller,
        {
          procedure: 'connections.forget',
          clientActionID: input.clientActionID,
          input: { connection: input.connection },
        },
        async () => {
          const result = await port.forgetConnection(input.connection);

          return result.kind === 'forgotten' ? { ...result.state } : { error: result.kind };
        },
      );

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (refusedSchema.safeParse(run.result).success) {
        throw options.errors.CONNECTION_NOT_FOUND();
      }

      // The first result says how far the forget got. A retry reads where it stands now.
      const current = await port.readForgetState(input.connection);

      return readContractForgetStatus(context, current?.state ?? forgetSchema.parse(run.result));
    }),

    checkPicked: connections.checkPicked.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      requirePort(options.errors.CONNECTIONS_NOT_STARTED);

      const picked = await context.readPickedFiles?.(options.input.connection, options.input.files);

      if (picked === null || picked === undefined) {
        throw options.errors.CONNECTION_NOT_FOUND();
      }

      return [...picked];
    }),

    readForgetStatus: connections.readForgetStatus.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = requirePort(options.errors.CONNECTIONS_NOT_STARTED);

      return Promise.all(
        options.input.connections.map(async (connection) => {
          const read = await port.readForgetState(connection);

          if (read === null) {
            throw options.errors.CONNECTION_NOT_FOUND();
          }

          return { connection, ...(await readContractForgetStatus(context, read.state)) };
        }),
      );
    }),
  };
}

function toRegisterClientResult(result: RegisterClientResult): JSONObject {
  return result.kind === 'registered'
    ? { client: result.client, redirectURI: result.redirectURI }
    : { error: result.kind };
}

function toSetPickerResult(result: SetPickerResult): JSONObject {
  return result.kind === 'ok' ? {} : { error: result.kind };
}

function toRemoveClientResult(result: RemoveClientResult): JSONObject {
  return result.kind === 'ok' ? {} : { error: result.kind };
}

function toStartConsentResult(result: StartConsentResult): JSONObject {
  return result.kind === 'started'
    ? { consentID: result.consentID, expiresAt: result.expiresAt }
    : { error: result.kind };
}
