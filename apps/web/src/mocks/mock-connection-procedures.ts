// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { faker } from '@faker-js/faker';
import { buildMockSetupSteps } from './build-mock-setup-steps';
import { buildShortID, connectionStore } from './connection-store';
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

// The mock holds one OAuth client and the connections made against it. A consent finishes at once
// with the scopes in `connectionStore.answers`, and a forget answers with `answers.forget`.
export const mockConnectionProcedures = {
  readSetup: mockImplementer.connections.readSetup.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const client = connectionStore.clients.findFirst();

    return {
      steps: buildMockSetupSteps(client?.origin ?? options.input.origin),
      client:
        client === undefined
          ? null
          : {
              client: client.client,
              origin: client.origin,
              redirectURI: client.redirectURI,
              fingerprint: client.fingerprint,
              pickerKey: client.pickerKey,
              projectNumber: client.projectNumber,
            },
    };
  }),

  registerClient: mockImplementer.connections.registerClient.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (connectionStore.clients.findFirst() !== undefined) {
      throw options.errors.CLIENT_EXISTS();
    }

    const input = options.input;
    const redirectURI = `${input.origin}/connections/google/return`;

    const client = await connectionStore.clients.create({
      clientID: input.clientID,
      origin: input.origin,
      redirectURI,
      pickerKey: input.pickerKey ?? null,
      projectNumber: input.projectNumber ?? null,
    });

    return { client: client.client, redirectURI };
  }),

  setPicker: mockImplementer.connections.setPicker.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const client = connectionStore.clients.findFirst((query) =>
      query.where({ client: options.input.client }),
    );

    if (client === undefined) {
      throw options.errors.CLIENT_NOT_FOUND();
    }

    await connectionStore.clients.update(client, {
      data(draft) {
        draft.pickerKey = options.input.pickerKey;
        draft.projectNumber = options.input.projectNumber;
      },
    });

    return {};
  }),

  removeClient: mockImplementer.connections.removeClient.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const client = connectionStore.clients.findFirst((query) =>
      query.where({ client: options.input.client }),
    );

    if (client === undefined) {
      throw options.errors.CLIENT_NOT_FOUND();
    }

    const isUsed = connectionStore.connections
      .all()
      .some((connection) => connection.status !== 'forgotten');

    if (isUsed) {
      throw options.errors.CLIENT_IN_USE();
    }

    await connectionStore.clients.delete(client);

    return {};
  }),

  startConsent: mockImplementer.connections.startConsent.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (connectionStore.clients.findFirst() === undefined) {
      throw options.errors.CLIENT_MISSING();
    }

    const target = options.input.connection;

    if (
      target !== null &&
      connectionStore.connections.findFirst((query) => query.where({ connection: target })) ===
        undefined
    ) {
      throw options.errors.CONNECTION_NOT_FOUND();
    }

    const state = faker.string.alphanumeric(24);

    await connectionStore.consents.create({
      state,
      sessionID: session.sessionID,
      connection: target,
    });

    return {
      consentURL: `/connections/google/return?state=${state}&code=mock-code`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
  }),

  finishConsent: mockImplementer.connections.finishConsent.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    const input = options.input;

    const consent = connectionStore.consents.findFirst((query) =>
      query.where({ state: input.state, sessionID: session.sessionID }),
    );

    if (consent === undefined) {
      throw options.errors.CONSENT_NOT_FOUND();
    }

    await connectionStore.consents.delete(consent);

    if (input.error !== null || input.code === null) {
      throw options.errors.CONSENT_REFUSED();
    }

    const scopes = connectionStore.answers.grantedScopes;

    const missing = connectionStore.allScopes
      .filter((scope) => !scopes.includes(scope))
      .map((scope) => ({ scope, reason: 'not_granted' as const }));

    const existing =
      consent.connection === null
        ? undefined
        : connectionStore.connections.findFirst((query) =>
            query.where({ connection: consent.connection ?? '' }),
          );

    if (existing !== undefined) {
      await connectionStore.connections.update(existing, {
        data(draft) {
          draft.status = 'active';
          draft.reason = null;
          draft.scopes = scopes;
          draft.missing = missing;

          draft.statusSince = new Date();
        },
      });

      return { connection: existing.connection, missing };
    }

    const connection = await connectionStore.connections.create({
      connection: buildShortID(),
      scopes,
      missing,
      lastSuccessAt: new Date(),
      fingerprint: faker.string.hexadecimal({ length: 12, prefix: '' }),
    });

    return { connection: connection.connection, missing };
  }),

  list: mockImplementer.connections.list.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return connectionStore.connections.all();
  }),

  forget: mockImplementer.connections.forget.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const connection = connectionStore.connections.findFirst((query) =>
      query.where({ connection: options.input.connection }),
    );

    if (connection === undefined) {
      throw options.errors.CONNECTION_NOT_FOUND();
    }

    const forget = connectionStore.answers.forget;

    await connectionStore.connections.update(connection, {
      data(draft) {
        draft.status = 'forgotten';
        draft.label = null;
        draft.account = null;
        draft.fingerprint = null;
        draft.forget = forget;
      },
    });

    return forget;
  }),

  readForgetStatus: mockImplementer.connections.readForgetStatus.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return options.input.connections.map((shortID) => {
      const connection = connectionStore.connections.findFirst((query) =>
        query.where({ connection: shortID }),
      );

      if (connection === undefined) {
        throw options.errors.CONNECTION_NOT_FOUND();
      }

      return {
        connection: shortID,
        ...(connection.forget ?? {
          erasure: 'pending' as const,
          revocation: 'pending' as const,
          backup: { state: 'off' as const },
        }),
      };
    });
  }),
};
