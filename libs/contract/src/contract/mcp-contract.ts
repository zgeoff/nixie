import { z } from 'zod';
import { mcpNoticeSchema } from './mcp-notice-schema';
import { signedIn } from './signed-in';

const mcpProcedure = signedIn.errors({
  MCP_NOT_STARTED: {
    message: 'nixie has not started its MCP proxy yet; try again in a moment',
    status: 503,
  },
});

const mcpToolSchema = z.object({
  tool: z.string(),
  state: z.enum(['exposed', 'stopped_changed', 'stopped_unfit', 'hidden_new', 'removed']),
  hiddenReason: z.string().nullable(),
  proposalID: z.string().nullable(),
});

export const mcpServerSchema = z.object({
  server: z.string(),
  state: z.enum(['held', 'added']),
  signIn: z.enum(['not_added', 'no_grant', 'needs_consent', 'ok']),
  health: z.enum(['healthy', 'unhealthy']),
  lastError: z.enum(['refused', 'error', 'unparsable', 'timeout', 'unauthorised']).nullable(),
  nextTryAtMs: z.number().int().nullable(),
  url: z.string().nullable(),
  proposalID: z.string().nullable(),
  tools: z.array(mcpToolSchema),
});

export const mcpContract = {
  // every server that is not removed, with its state, sign-in, health and tools
  listServers: mcpProcedure.output(z.array(mcpServerSchema)),

  connect: mcpProcedure
    .errors({
      SERVER_NOT_FOUND: { message: 'No MCP server has this ID', status: 404 },
      INVALID_ORIGIN: {
        message: 'The origin must be https, with no path, query or user name',
        status: 400,
      },
      SERVER_NOT_ADDED: {
        message: 'This server has no approved facts yet; approve its proposal first',
        status: 409,
      },
      DISCOVERY_FAILED: {
        message: 'The server did not name an authorization server that nixie can use',
        status: 502,
        data: z.object({ reason: z.string() }),
      },
    })
    .input(z.object({ server: z.string().min(1).max(64), origin: z.string().min(1).max(2048) }))
    .output(z.object({ authorizeURL: z.string() })),

  finishSignIn: mcpProcedure
    .errors({
      SIGN_IN_NOT_FOUND: {
        message: 'This sign-in is unknown, used or lapsed',
        status: 404,
      },
      SIGN_IN_REFUSED: { message: 'The server did not grant the sign-in', status: 400 },
      ISSUER_MISMATCH: {
        message: 'The sign-in came back from another authorization server',
        status: 400,
      },
      TOKEN_EXCHANGE_FAILED: {
        message: 'The authorization server refused the code',
        status: 502,
        data: z.object({ code: z.string() }),
      },
    })
    .input(
      z.object({
        state: z.string().min(1).max(500),
        code: z.string().min(1).max(2000).nullable(),
        error: z.string().max(500).nullable(),
        iss: z.string().max(2000).nullable(),
      }),
    )
    .output(z.object({ server: z.string() })),

  // the newest changes that applied with no allow, newest first, which the client shows the owner
  readNotices: mcpProcedure
    .input(z.strictObject({ limit: z.number().int().min(1).max(50) }))
    .output(z.object({ notices: z.array(mcpNoticeSchema) })),
};
