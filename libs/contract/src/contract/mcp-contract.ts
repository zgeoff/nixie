import { z } from 'zod';
import { signedIn } from './signed-in';

const mcpProcedure = signedIn.errors({
  MCP_NOT_STARTED: {
    message: 'nixie has not started its MCP proxy yet; try again in a moment',
    status: 503,
  },
});

export const mcpContract = {
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
};
