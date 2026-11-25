// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';

export function createMcpProcedures(context: APIContext) {
  const mcp = apiImplementer.mcp;

  return {
    connect: mcp.connect.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = context.readMcp?.() ?? null;

      if (port === null) {
        throw options.errors.MCP_NOT_STARTED();
      }

      const result = await port.connect(options.input.server, options.input.origin);

      return match(result)
        .with({ status: 'ok' }, (ok) => ({ authorizeURL: ok.authorizeURL }))
        .with({ status: 'unknown_server' }, () => {
          throw options.errors.SERVER_NOT_FOUND();
        })
        .with({ status: 'invalid_origin' }, () => {
          throw options.errors.INVALID_ORIGIN();
        })
        .with({ status: 'not_added' }, () => {
          throw options.errors.SERVER_NOT_ADDED();
        })
        .with({ status: 'discovery_failed' }, (failed) => {
          throw options.errors.DISCOVERY_FAILED({ data: { reason: failed.reason } });
        })
        .exhaustive();
    }),

    finishSignIn: mcp.finishSignIn.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = context.readMcp?.() ?? null;

      if (port === null) {
        throw options.errors.MCP_NOT_STARTED();
      }

      const result = await port.finishSignIn(options.input);

      return match(result)
        .with({ status: 'ok' }, (ok) => ({ server: ok.server }))
        .with({ status: 'unknown_state' }, () => {
          throw options.errors.SIGN_IN_NOT_FOUND();
        })
        .with({ status: 'refused' }, () => {
          throw options.errors.SIGN_IN_REFUSED();
        })
        .with({ status: 'issuer_mismatch' }, () => {
          throw options.errors.ISSUER_MISMATCH();
        })
        .with({ status: 'exchange_failed' }, (failed) => {
          throw options.errors.TOKEN_EXCHANGE_FAILED({ data: { code: failed.code } });
        })
        .exhaustive();
    }),

    readNotices: mcp.readNotices.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = context.readMcp?.() ?? null;

      if (port === null) {
        throw options.errors.MCP_NOT_STARTED();
      }

      return { notices: await port.readNotices(options.input.limit) };
    }),
  };
}
