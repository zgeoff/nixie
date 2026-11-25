// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { isMockPasskeyWindowOpen } from './is-mock-passkey-window-open';
import { mockImplementer } from './mock-implementer';
import { mockPasskeyCode } from './passkey-rows';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

const passkeys = mockImplementer.passkeys;
const rpId = 'localhost';

export const mockPasskeyProcedures = {
  challenge: passkeys.challenge.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (readLivePasskeys().length === 0) {
      throw options.errors.NO_PASSKEY();
    }

    return {
      options: {
        challenge: buildMockChallenge(),
        rpId,
        allowCredentials: [],
        userVerification: 'required' as const,
        timeout: 300_000,
      },
    };
  }),

  window: passkeys.window.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { isOpen: isMockPasskeyWindowOpen(options.input.for.kind) };
  }),

  registrationOptions: passkeys.registrationOptions.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const input = options.input;

    if (input.code === undefined && input.passkey === undefined) {
      throw options.errors.CODE_REQUIRED();
    }

    if (input.code !== undefined && input.code !== mockPasskeyCode) {
      throw options.errors.CODE_INVALID();
    }

    return {
      options: {
        rp: { id: rpId, name: 'nixie' },
        user: {
          id: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
          name: 'nixie',
          displayName: 'nixie',
        },
        challenge: buildMockChallenge(),
        pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
        timeout: 300_000,
        excludeCredentials: readLivePasskeys().map((row) => ({
          id: row.credentialID,
          type: 'public-key' as const,
        })),
        authenticatorSelection: {
          residentKey: 'required' as const,
          requireResidentKey: true,
          userVerification: 'required' as const,
        },
        attestation: 'none' as const,
      },
    };
  }),

  register: passkeys.register.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const created = await store.passkeyRows.create({
      credentialID: options.input.response.id,
      label: options.input.label ?? session.deviceName,
    });

    return { passkeyID: created.passkeyID };
  }),

  list: passkeys.list.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      passkeys: store.passkeyRows
        .findMany(undefined, { orderBy: { registeredAt: 'asc' } })
        .map((row) => ({
          passkeyID: row.passkeyID,
          label: row.label,
          synced: row.isSynced,
          authorizedBy: row.authorizedBy,
          registeredAt: row.registeredAt,
          lastUsedAt: row.lastUsedAt,
          revokedAt: row.revokedAt,
        })),
    };
  }),

  revoke: passkeys.revoke.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const row = store.passkeyRows.findFirst((query) =>
      query.where({ passkeyID: options.input.passkeyID }),
    );

    if (row === undefined) {
      throw options.errors.NOT_FOUND();
    }

    const revokedAt = new Date();

    await store.passkeyRows.update(row, {
      data: (draft) => {
        draft.revokedAt = revokedAt;
      },
    });

    return { revokedAt };
  }),
};

function readLivePasskeys() {
  return store.passkeyRows.findMany((query) => query.where({ revokedAt: null }));
}

function buildMockChallenge(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}
