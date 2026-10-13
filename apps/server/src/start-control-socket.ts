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
  readonly readSessions: () => Promise<readonly HostSession[]>;
  readonly updateSessionLabel: (input: SessionLabel) => Promise<SessionLabelResult>;
}

// A live device session as a host command lists it.
export interface HostSession {
  readonly sessionID: string;
  readonly deviceName: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
}

export interface SessionLabel {
  readonly sessionID: string;
  readonly label: string;
}

export type SessionLabelResult =
  | { readonly status: 'labelled'; readonly sessionID: string; readonly label: string }
  | { readonly status: 'invalid_label' }
  | { readonly status: 'not_found' };

export interface EnrolmentCode {
  readonly code: string;
  readonly expiresAt: Date;
}

export interface ControlSocket {
  readonly stop: () => Promise<void>;
}

// Starts the control socket that host commands reach the server through, since only the writer
// lock's holder may write: enrolment codes, session labels, and memory proposals through the memory
// gate. A stale socket file is removed first: the writer lock already proves no other server runs.
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
      ...buildSessionRoutes(options),
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

// lists the live device sessions, and sets the label of one
function buildSessionRoutes(options: ControlSocketOptions) {
  return {
    '/sessions': {
      GET: async () => {
        const sessions = await options.readSessions();

        return Response.json(
          sessions.map((session) => ({
            sessionID: session.sessionID,
            deviceName: session.deviceName,
            createdAt: session.createdAt.toISOString(),
            lastUsedAt: session.lastUsedAt.toISOString(),
          })),
        );
      },
    },
    '/sessions/label': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const body: unknown = await request.json().catch(() => null);
        const parsed = labelBody.safeParse(body);

        if (!parsed.success) {
          throw new ControlRequestError(400, 'a label takes a sessionID and a label');
        }
        const result = await options.updateSessionLabel(parsed.data);

        if (result.status === 'not_found') {
          throw new ControlRequestError(
            404,
            'no device session that is still signed in has that ID',
          );
        }
        if (result.status === 'invalid_label') {
          throw new ControlRequestError(400, 'a label holds 1 to 100 characters besides spaces');
        }
        return Response.json({ sessionID: result.sessionID, label: result.label });
      },
    },
  } as const;
}

const labelBody = z.strictObject({ sessionID: z.string().min(1), label: z.string() });

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
        const result = await requireProposals(options).approve({
          proposalID: answer.proposalID,
          actionHash: answer.actionHash,
          identityID: hostIdentityID,
          ...(answer.revisionOf === undefined ? {} : { revisionOf: answer.revisionOf }),
          ...(answer.ignoreCloseMatch === undefined
            ? {}
            : { ignoreCloseMatch: answer.ignoreCloseMatch }),
        });

        return Response.json(result);
      },
    },
    '/memory/proposals/reject': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const answer = await parseAnswer(request);

        await requireProposals(options).reject({
          proposalID: answer.proposalID,
          actionHash: answer.actionHash,
          identityID: hostIdentityID,
        });
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

// What a host command shows of a pending proposal: its text, every source that proposed it, and
// the hash an answer binds to.
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
    sources: proposal.sources.map((source) => ({
      origin: source.origin,
      thread: source.thread,
      proposedAt: new Date(source.proposedAt).toISOString(),
    })),
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

// an approval held for a close match is answered again, as a revision of that item or as a new item
const answerBody = z.strictObject({
  proposalID: z.string().min(1),
  actionHash: z.string().min(1),
  revisionOf: z.strictObject({ itemID: z.string().min(1), version: z.int().positive() }).optional(),
  ignoreCloseMatch: z.boolean().optional(),
});

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
  ['REVISION_TARGET', 400],
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
