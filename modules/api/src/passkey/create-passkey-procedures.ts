// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { createPasskeyChallenge } from './create-passkey-challenge';
import { createRegistrationOptions } from './create-registration-options';
import { isPasskeyWindowOpen } from './is-passkey-window-open';
import { readAllPasskeys } from './read-all-passkeys';
import { writePasskeyRevocation } from './write-passkey-revocation';
import { writeRegistration } from './write-registration';

export function createPasskeyProcedures(context: APIContext) {
  const passkeys = apiImplementer.passkeys;

  return {
    challenge: passkeys.challenge.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const issued = await createPasskeyChallenge(context, {
        caller,
        binding: options.input.for,
      });

      if (issued === null) {
        throw options.errors.NO_PASSKEY();
      }

      return { options: { ...issued, allowCredentials: [] } };
    }),

    window: passkeys.window.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      return { isOpen: isPasskeyWindowOpen(context, caller.identityID, options.input.for) };
    }),

    registrationOptions: passkeys.registrationOptions.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await createRegistrationOptions(context, {
        caller,
        origin: options.context.origin,
        code: options.input.code,
        assertion: options.input.passkey,
      });

      if (result.status === 'issued') {
        return { options: result.options };
      }

      if (result.status === 'failed') {
        throw options.errors.PASSKEY_FAILED({ data: { reason: result.reason } });
      }

      throw {
        origin_unsupported: options.errors.ORIGIN_UNSUPPORTED,
        origin_changed: options.errors.ORIGIN_CHANGED,
        too_many: options.errors.TOO_MANY_PASSKEYS,
        code_required: options.errors.CODE_REQUIRED,
        code_invalid: options.errors.CODE_INVALID,
      }[result.status]();
    }),

    register: passkeys.register.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeRegistration(context, caller, {
        input: options.input,
        origin: options.context.origin,
      });

      if (result.status === 'registered') {
        return { passkeyID: result.passkeyID };
      }

      if (result.status === 'failed') {
        throw options.errors.REGISTRATION_FAILED({ data: { reason: result.reason } });
      }

      throw {
        too_many: options.errors.TOO_MANY_PASSKEYS,
        origin_unsupported: options.errors.ORIGIN_UNSUPPORTED,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
        unauthorized: options.errors.UNAUTHORIZED,
      }[result.status]();
    }),

    list: passkeys.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const rows = await readAllPasskeys(context.log.writer.db);

      return {
        passkeys: rows.map((row) => ({
          passkeyID: row.passkey_id,
          label: row.label,
          synced: row.backup_eligible === 1,
          authorizedBy: row.authorized_by,
          registeredAt: new Date(row.registered_at),
          lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at),
          revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
        })),
      };
    }),

    revoke: passkeys.revoke.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writePasskeyRevocation(context, caller, {
        clientActionID: options.input.clientActionID,
        passkeyID: options.input.passkeyID,
        assertion: options.input.passkey,
      });

      if (result.status === 'revoked') {
        return { revokedAt: new Date(result.revokedAt) };
      }

      if (result.status === 'failed') {
        throw options.errors.PASSKEY_FAILED({ data: { reason: result.verdict.reason } });
      }

      throw {
        not_found: options.errors.NOT_FOUND,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
        unauthorized: options.errors.UNAUTHORIZED,
      }[result.status]();
    }),
  };
}
