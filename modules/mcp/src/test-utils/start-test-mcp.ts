import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log } from '@heynixie/log';
import { logProjections, readRecords, startWriter, writeRecordsInTransaction } from '@heynixie/log';
import type { McpToolOverride } from '@heynixie/policy';
import type { AnswerOutcome, ProposalKindHandler } from '@heynixie/proposals';
import { answerProposal, buildProposalsProjection, readProposal } from '@heynixie/proposals';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { applyListing } from '../listing/apply-listing';
import { makeMcpProposalHandler } from '../proposal/make-mcp-proposal-handler';
import { mapMcpProposalRecord } from '../proposal/map-mcp-proposal-record';
import { mcpHealthChangedCodec } from '../record/mcp-health-changed-codec';
import { mcpNoticeCodec } from '../record/mcp-notice-codec';
import { mcpProjections } from '../rows/mcp-projections';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRow } from '../rows/read-tool-rows';
import { runServerStart } from '../start/run-server-start';
import type { McpContext, PinMove, ServerFacts, ToolForm } from '../types';

export interface ListInput {
  readonly forms: readonly ToolForm[];
  readonly isTrusted?: boolean;

  // the server's override file, by the tool's own name
  readonly overrides?: Readonly<Record<string, McpToolOverride>>;

  // runs after the listing read what it compares with and before it writes
  readonly afterRead?: () => Promise<void>;
}

export interface TestMcpOptions {
  // projections of other modules that the log also holds, for a test that writes their records
  readonly extraProjections?: Log['projections'];

  // the handler of the mcp family, read at each answer; the default forgets nothing in a store
  readonly readHandler?: () => ProposalKindHandler;
}

export interface TestMcp {
  readonly log: Log;
  readonly clock: ReturnType<typeof createFakeClock>;
  readonly context: McpContext;

  // Moves the definitions snapshot that every later write and read names, as a seed does.
  readonly moveSnapshot: (snapshotHash: string) => void;

  // the credential IDs that a removal asked the store to forget
  readonly forgotten: string[];

  // Answers the proposal as the owner would, with the hash the proposal holds.
  readonly answer: (proposalID: string, choice: 'approve' | 'decline') => Promise<AnswerOutcome>;

  // Starts with the server in the config and approves its proposal, so it joins as added.
  readonly addServer: (serverID: string, facts: ServerFacts) => Promise<void>;

  // One passed listing of the server, with the pin moves it made.
  readonly list: (serverID: string, input: ListInput) => Promise<readonly PinMove[]>;

  // Approves the open allow proposal of the tool.
  readonly allow: (tool: string) => Promise<void>;

  // the notices that listings wrote, oldest first
  readonly readNotices: () => Promise<ReturnType<typeof mcpNoticeCodec.decode>[]>;

  // the health changes of servers, oldest first
  readonly readHealthChanges: () => Promise<ReturnType<typeof mcpHealthChangedCodec.decode>[]>;
}

// A real log with the tables of the proxy and of the proposals, and the shared answer path with
// the proxy's handler on it.
export async function startTestMcp(options: TestMcpOptions = {}): Promise<TestMcp> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-mcp-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const projection = buildProposalsProjection([mapMcpProposalRecord]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...mcpProjections,
      projection,
      ...(options.extraProjections ?? []),
    ],
  };

  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });
  const snapshot = { hash: 'sha256:test' };
  const definitions = () => ({ snapshotHash: snapshot.hash });
  const context: McpContext = { log, definitions, now: () => clock.now() };
  const forgotten: string[] = [];

  const defaultHandler = makeMcpProposalHandler({
    ...context,
    removeCredentials: (ids) => {
      forgotten.push(...ids);

      return Promise.resolve();
    },
  });

  const deps = {
    log,
    clock,
    definitions,
    projection,
    get handlers() {
      return new Map([['mcp' as const, options.readHandler?.() ?? defaultHandler]]);
    },
    readDeferContext: () => Promise.resolve({ quietHours: null, zone: 'UTC' }),
    writeThreadRecord: async (
      tx: Parameters<typeof writeRecordsInTransaction>[0],
      input: Parameters<typeof writeRecordsInTransaction>[2][number],
    ) => {
      await writeRecordsInTransaction(tx, log, [input]);
    },
  };

  const answer = async (proposalID: string, choice: 'approve' | 'decline') => {
    const proposal = await readProposal(writer.db, proposalID);

    invariant(proposal, 'the proposal exists');

    return answerProposal(
      deps,
      { proposalID, actionHash: proposal.actionHash, choice, identityID: 'identity-1' },
      { family: 'mcp', passkey: { kind: 'host' } },
    );
  };

  return {
    log,
    clock,
    context,
    moveSnapshot: (snapshotHash) => {
      snapshot.hash = snapshotHash;
    },
    forgotten,
    answer,
    addServer: async (serverID, facts) => {
      await runServerStart(context, {
        config: { [serverID]: facts },
        removeCredentials: () => Promise.resolve(),
      });

      const rows = await readServerRows(writer.db);

      const proposalID = rows.find((row) => row.server_id === serverID)?.proposal_id ?? null;

      invariant(proposalID !== null, 'the start proposed the server');

      await answer(proposalID, 'approve');
    },
    list: async (serverID, input) => {
      const moves: PinMove[] = [];

      await applyListing(
        {
          context,
          ...(input.afterRead === undefined ? {} : { afterRead: input.afterRead }),
          onPinMoved: (_tx, move) => {
            moves.push(move);

            return Promise.resolve();
          },
        },
        {
          serverID,
          isTrusted: input.isTrusted ?? false,
          forms: input.forms,
          takenModelNames: new Set(),
          ...(input.overrides === undefined ? {} : { overrides: input.overrides }),
        },
      );

      return moves;
    },
    allow: async (tool) => {
      const row = await readToolRow(writer.db, tool);

      const proposalID = row?.proposal_id ?? null;

      invariant(proposalID !== null, 'the tool waits for an allow');

      await answer(proposalID, 'approve');
    },
    readNotices: async () => {
      const records = await readRecords(log, { afterSequence: 0, kinds: [mcpNoticeCodec.kind] });

      return records.map((entry) => mcpNoticeCodec.decode(entry.record.payload));
    },
    readHealthChanges: async () => {
      const records = await readRecords(log, {
        afterSequence: 0,
        kinds: [mcpHealthChangedCodec.kind],
      });

      return records.map((entry) => mcpHealthChangedCodec.decode(entry.record.payload));
    },
  };
}
