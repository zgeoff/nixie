import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MemoryProposal, MemoryProposals } from '@heynixie/memory';
import { z } from 'zod';

export interface ControlSocketOptions {
  // a Unix socket in a directory only nixie's user may enter
  readonly path: string;
  readonly createEnrolmentCode: () => Promise<EnrolmentCode>;

  // the memory proposals, or null until the memory store starts
  readonly readProposals: () => MemoryProposals | null;
}

export interface EnrolmentCode {
  readonly code: string;
  readonly expiresAt: Date;
}

export interface ControlSocket {
  readonly stop: () => Promise<void>;
}

// Starts the control socket that host commands reach the server through, since only the writer
// lock's holder may write: enrolment codes, and memory proposals through the memory gate. A stale
// socket file is removed first: the writer lock already proves no other server runs.
export async function startControlSocket(options: ControlSocketOptions): Promise<ControlSocket> {
  await mkdir(dirname(options.path), { recursive: true, mode: 0o700 });
  await rm(options.path, { force: true });

  const server = Bun.serve({
    unix: options.path,
    routes: {
      '/enrolment-codes': {
        POST: async () => {
          const issued = await options.createEnrolmentCode();

          return Response.json({ code: issued.code, expiresAt: issued.expiresAt.toISOString() });
        },
      },
      ...buildMemoryRoutes(options),
    },
    fetch: () => new Response('not found', { status: 404 }),

    // only nixie's user reaches the socket, so the host command can show the reason
    error: (error) => new Response(error.message, { status: pickErrorStatus(error) }),
  });

  return {
    stop: async () => {
      await server.stop(true);
      await rm(options.path, { force: true });
    },
  };
}

// lists the pending proposals, and answers one under the action hash the host command showed
function buildMemoryRoutes(options: ControlSocketOptions) {
  return {
    '/memory/proposals': {
      GET: async () => {
        const pending = await requireProposals(options).listPending();

        return Response.json(pending.map((proposal) => buildPendingEntry(proposal)));
      },
    },
    '/memory/proposals/approve': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const answer = await parseAnswer(request);
        const ref = await requireProposals(options).approve({
          ...answer,
          identityID: hostIdentityID,
        });

        return Response.json(ref);
      },
    },
    '/memory/proposals/reject': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const answer = await parseAnswer(request);

        await requireProposals(options).reject({ ...answer, identityID: hostIdentityID });
        return Response.json({ proposalID: answer.proposalID });
      },
    },
  } as const;
}

// An answer through the socket comes from a shell in nixie's container, which no device session
// reaches, so its approval record names the host as the identity that answered.
const hostIdentityID = 'host';

function requireProposals(options: ControlSocketOptions): MemoryProposals {
  const proposals = options.readProposals();

  if (proposals === null) {
    throw new ControlRequestError(503, 'the memory store has not started yet');
  }
  return proposals;
}

// What a host command shows of a pending proposal: its text, and the hash an answer binds to.
function buildPendingEntry(proposal: MemoryProposal) {
  return {
    proposalID: proposal.proposalID,
    operation: proposal.operation,
    itemID: proposal.itemID,
    targetVersion: proposal.targetVersion,
    isPinned: proposal.isPinned,
    reason: proposal.reason,
    actionHash: proposal.actionHash,
    origin: proposal.origin,
    source: proposal.source,
    createdAt: new Date(proposal.createdAt).toISOString(),
    lapseAt: new Date(proposal.lapseAt).toISOString(),
    text: proposal.text,
    quote: proposal.quote,
  };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
async function parseAnswer(request: Request): Promise<z.infer<typeof answerBody>> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = answerBody.safeParse(body);

  if (!parsed.success) {
    throw new ControlRequestError(400, 'an answer takes a proposalID and an actionHash');
  }
  return parsed.data;
}

const answerBody = z.strictObject({ proposalID: z.string().min(1), actionHash: z.string().min(1) });

// the memory gate's refusals keep their meaning for the host command; anything else is a failure
function pickErrorStatus(error: Error): number {
  if (error instanceof ControlRequestError) {
    return error.status;
  }
  const code = 'code' in error ? error.code : null;

  return typeof code === 'string' ? (errorStatuses.get(code) ?? 500) : 500;
}

const errorStatuses = new Map([
  ['NOT_FOUND', 404],
  ['PROPOSAL_HASH', 409],
  ['PROPOSAL_CLOSED', 409],
  ['STALE_VERSION', 409],
  ['WRONG_STATE', 409],
  ['PINNED_CORE_FULL', 409],
]);

// a request the socket refuses before the memory gate sees it, with the status it answers
class ControlRequestError extends Error {
  override readonly name = 'ControlRequestError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
