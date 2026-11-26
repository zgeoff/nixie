import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { findMcpToolOverride } from '@heynixie/policy';
import type { ApplyOutcome, ProposalAnswerInput, SharedProposal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { pickFitFault } from '../declaration/pick-fit-fault';
import { pickNameRefusal } from '../name/pick-name-refusal';
import { mcpAnsweredCodec } from '../record/mcp-answered-codec';
import { mcpPinMovedCodec } from '../record/mcp-pin-moved-codec';
import { mcpServerChangedCodec } from '../record/mcp-server-changed-codec';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import { pickFormRefusal } from '../registry/pick-form-refusal';
import type { McpServerRow, McpToolRow } from '../rows/mcp-tables';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRows } from '../rows/read-tool-rows';
import { toCredentialFields } from '../rows/to-credential-fields';
import { toFactsInUse } from '../rows/to-facts-in-use';
import { toRequestedFacts } from '../rows/to-requested-facts';
import type { McpContext, OnPinMoved, ReadOverrides, ToolForm } from '../types';

export interface AnswerContext extends McpContext {
  readonly onPinMoved?: OnPinMoved;

  // the override files of the definitions, which an approved form must still fit
  readonly readOverrides?: ReadOverrides;

  // Forgets the credentials of a server whose URL or client ID changed, once the answer commits.
  readonly removeCredentials?: (credentialIDs: readonly string[]) => Promise<void>;
}

interface AnswerRequest {
  readonly row: SharedProposal;
  readonly answer: ProposalAnswerInput;
}

// Applies the owner's answer to one mcp proposal in the core's transaction. An approved server
// moves to `added` with the facts it asked for. An approved allow moves the tool's pin to the hash
// the operation holds, which is the tool's latest hash at this answer.
export async function answerMcpProposal(
  context: AnswerContext,
  tx: Transaction<unknown>,
  request: AnswerRequest,
): Promise<ApplyOutcome> {
  const proposalID = request.row.id;
  const isApproved = request.answer.choice !== 'decline';

  const answered: RecordInput = {
    kind: mcpAnsweredCodec.kind,
    definitions: context.definitions(),
    payload: mcpAnsweredCodec.encode({
      proposalID,
      state: isApproved ? 'approved' : 'declined',
      identityID: request.answer.identityID,
    }),
  };

  const servers = await readServerRows(tx);

  const server = servers.find((candidate) => candidate.proposal_id === proposalID);

  if (server !== undefined) {
    return answerServer(context, tx, { proposalID, server, answered, isApproved });
  }

  const tools = await readToolRows(tx);

  const tool = tools.find((candidate) => candidate.proposal_id === proposalID);

  if (tool === undefined) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'proposal_detached' } };
  }

  return answerAllow(context, tx, { proposalID, tool, answered, isApproved });
}

interface ServerAnswer {
  readonly proposalID: string;
  readonly server: McpServerRow;
  readonly answered: RecordInput;
  readonly isApproved: boolean;
}

async function answerServer(
  context: AnswerContext,
  tx: Transaction<unknown>,
  request: ServerAnswer,
): Promise<ApplyOutcome> {
  const server = request.server;
  const proposalID = request.proposalID;
  const inUse = toFactsInUse(server);
  const requested = toRequestedFacts(server);

  if (requested === null) {
    return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'proposal_detached' } };
  }

  // A new URL or client ID is a new grant: the old one is forgotten, so you sign in again.
  const isNewGrant =
    inUse === null || inUse.url !== requested.url || inUse.clientID !== requested.clientID;

  const old = [server.client_credential_id, server.grant_credential_id].filter((id) => id !== null);

  const changed: RecordInput = request.isApproved
    ? {
        kind: mcpServerChangedCodec.kind,
        definitions: context.definitions(),
        payload: mcpServerChangedCodec.encode({
          serverID: server.server_id,
          cause: 'approved',
          state: 'added',
          facts: requested,
          requested: null,
          proposalID: null,
          ...(isNewGrant
            ? {
                clientCredentialID: crypto.randomUUID(),
                grantCredentialID: crypto.randomUUID(),
                grantBinding: null,
              }
            : toCredentialFields(server)),
        }),
      }
    : {
        kind: mcpServerChangedCodec.kind,
        definitions: context.definitions(),
        payload: mcpServerChangedCodec.encode({
          serverID: server.server_id,
          cause: 'held',
          state: server.state,
          facts: inUse,
          requested,
          proposalID: null,
          ...toCredentialFields(server),
        }),
      };

  await writeRecordsInTransaction(tx, context.log, [request.answered, changed]);

  const forget = request.isApproved && isNewGrant ? old : [];

  return {
    status: 'done',
    result: { proposalID, state: request.isApproved ? 'approved' : 'declined' },
    usedBy: null,
    detail: null,
    otherThreads: [],
    ...(forget.length === 0 || context.removeCredentials === undefined
      ? {}
      : { afterCommit: () => context.removeCredentials?.(forget) ?? Promise.resolve() }),
  };
}

interface AllowAnswer {
  readonly proposalID: string;
  readonly tool: McpToolRow;
  readonly answered: RecordInput;
  readonly isApproved: boolean;
}

async function answerAllow(
  context: AnswerContext,
  tx: Transaction<unknown>,
  request: AllowAnswer,
): Promise<ApplyOutcome> {
  const tool = request.tool;
  const proposalID = request.proposalID;
  let fault: string | null = null;

  if (request.isApproved) {
    const form = await readPinnedForm(context, tx, tool);

    if (form === null || isFormRefused(tool, form)) {
      return { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'form_refused' } };
    }

    fault = await readFitFault(context, tx, { tool, form });
  }

  const nextState = pickAllowedState(tool, fault);

  const changed: RecordInput = {
    kind: mcpToolChangedCodec.kind,
    definitions: context.definitions(),
    payload: mcpToolChangedCodec.encode({
      serverID: tool.server_id,
      tool: tool.tool,
      pinnedHash: request.isApproved ? tool.latest_hash : tool.pinned_hash,
      latestHash: tool.latest_hash,
      state: request.isApproved ? nextState : tool.state,
      hiddenReason: request.isApproved ? fault : tool.hidden_reason,
      proposalID: null,
    }),
  };

  const moved: readonly RecordInput[] = request.isApproved
    ? [
        {
          kind: mcpPinMovedCodec.kind,
          definitions: context.definitions(),
          payload: mcpPinMovedCodec.encode({
            tool: tool.tool,
            fromHash: tool.pinned_hash,
            toHash: tool.latest_hash,
            cause: 'allowed',
          }),
        },
      ]
    : [];

  await writeRecordsInTransaction(tx, context.log, [request.answered, changed, ...moved]);

  if (request.isApproved) {
    await context.onPinMoved?.(tx, {
      tool: tool.tool,
      fromHash: tool.pinned_hash,
      toHash: tool.latest_hash,
      cause: 'allowed',
    });
  }

  return {
    status: 'done',
    result: { proposalID, state: request.isApproved ? 'approved' : 'declined' },
    usedBy: null,
    detail: null,
    otherThreads: [],
  };
}

// The form that an approval would pin. A listing keeps a refused form hidden, but a proposal that
// an older listing wrote can still wait on one.
async function readPinnedForm(
  context: AnswerContext,
  tx: Transaction<unknown>,
  tool: McpToolRow,
): Promise<ToolForm | null> {
  const found = await readFormsByHash(
    { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } },
    [tool.latest_hash],
  );

  return found.get(tool.latest_hash)?.form ?? null;
}

// Whether the registry refuses the form, or no readable form is left to pin.
function isFormRefused(tool: McpToolRow, form: ToolForm): boolean {
  const refusal =
    pickNameRefusal({
      serverID: tool.server_id,
      toolName: form.name,
      takenModelNames: new Set(),
    }) ?? pickFormRefusal(tool.tool, form);

  return refusal !== null;
}

interface FitRequest {
  readonly tool: McpToolRow;
  readonly form: ToolForm;
}

async function readFitFault(
  context: AnswerContext,
  tx: Transaction<unknown>,
  request: FitRequest,
): Promise<string | null> {
  const serverID = request.tool.server_id;

  const inForce = await context.readOverrides?.(tx);

  const override =
    inForce === undefined
      ? null
      : findMcpToolOverride(inForce.servers, serverID, request.form.name);

  if (override === null) {
    return null;
  }

  const rows = await readToolRows(tx, serverID);

  const names = new Set(
    rows.filter((row) => row.state !== 'removed').map((row) => row.tool.slice(serverID.length + 1)),
  );

  return pickFitFault(override, request.form, names);
}

// What an allowed form leaves the tool as: removed when the server dropped it, stopped when the
// override of the definitions no longer fits the form, and exposed otherwise.
function pickAllowedState(tool: McpToolRow, fault: string | null): McpToolRow['state'] {
  if (tool.state === 'removed') {
    return 'removed';
  }

  return fault === null ? 'exposed' : 'stopped_unfit';
}
