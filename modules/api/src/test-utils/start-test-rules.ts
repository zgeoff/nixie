import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actionsProjection } from '@heynixie/actions';
import type { MandateInput } from '@heynixie/definitions';
import {
  createPathSource,
  gapAnswersProjection,
  gapGroupsProjection,
  readDefinitionsInForce,
  readSnapshotPolicy,
  runInForceSeed,
  runSeed,
  writeMandateProposal,
  writeProposedRuleEdit,
} from '@heynixie/definitions';
import type { JSONObject, Log } from '@heynixie/log';
import {
  logProjections,
  removeRecordKey,
  startWriter,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import type { PolicyCall } from '@heynixie/policy';
import {
  buildActionProposalInput,
  makeDecisionPoint,
  replayDecision,
  toStoredDecision,
} from '@heynixie/policy';
import type { ProposalAnswerInput } from '@heynixie/proposals';
import { answerProposal, readProposal } from '@heynixie/proposals';
import { createConversationTask, tasksProjections } from '@heynixie/tasks';
import { buildTestRunSettings } from '@heynixie/tasks/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { apiProjections } from '../api/api-projections';
import { createPasskeyState } from '../passkey/passkey-state';
import { buildProposalCoreDeps } from '../proposal/build-proposal-core-deps';
import { proposalsProjection } from '../proposal/proposals-projection';
import type { APIContext } from '../types';
import { defaultAPISettings } from '../utils/default-api-settings';

interface DecidedCall extends Pick<PolicyCall, 'tool' | 'destinations'> {
  readonly args: JSONObject;
}

interface AskFacts {
  readonly to: string;
  readonly body?: string;
  readonly tool?: string;
  readonly cause?: 'no_rule' | 'always_ask';
}

// The device API, the proposals and the rule store on one real database, with a clock that the test
// moves. An approval here passes the host's gate, since the passkey check has its own tests.
export async function startTestRules(settings: APIContext['settings'] = defaultAPISettings) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-test-rules-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const writer = await startWriter({ dataDir, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      actionsProjection,
      ...apiProjections,
      ...memoryProjections,
      gapAnswersProjection,
      gapGroupsProjection,
      proposalsProjection,
    ],
  };

  const context: APIContext = {
    log,
    clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    runSettings: buildTestRunSettings(),
    settings,
    passkeys: createPasskeyState(),
    readSessionCleanup: () => null,
  };

  await createConversationTask(context);

  const root = join(dataDir, 'definitions');

  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await runSeed({
    log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const runSeedInForce = () =>
    runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) });

  const rulesContext = { ...context, runInForceSeed: runSeedInForce };

  const deps = buildProposalCoreDeps(context, {
    readMemory: () => null,
    runInForceSeed: runSeedInForce,
  });

  const pointOptions = {
    findDeclaration: () => ({
      effects: ['send' as const],
      destinations: ['to'],
      amount: null,
      content: ['body'],
      results: {},
    }),
    readInputs: async (snapshot: string) => {
      const read = await readSnapshotPolicy(writer.db, snapshot);

      return { rules: read.rules, contacts: [], tools: read.tools, ownerDestinations: [] };
    },
    findJobDestinations: () => [],
  };

  const decide = makeDecisionPoint({ ...pointOptions, readConsent: () => Promise.resolve(null) });

  const readCall = async (call: DecidedCall): Promise<PolicyCall> => {
    const inForce = await readDefinitionsInForce(writer.db);

    invariant(inForce, 'the seed put definitions in force');

    return {
      toolList: [call.tool],
      tool: call.tool,
      context: 'conversation',
      definitionID: null,
      args: call.args,
      destinations: call.destinations,
      sources: ['owner'],
      at: clock.now(),
      turnMessageSequence: null,
      onBehalfOf: [],
      snapshot: inForce.snapshotHash,
    };
  };

  return {
    log,
    clock,
    context,
    deps,
    runInForceSeed: runSeedInForce,

    // Writes the action proposal that an ask with no matching rule leaves, and returns its row ID.
    ask: async (facts: AskFacts): Promise<string> => {
      const proposal = buildActionProposalInput({
        definitions: context.definitions(),
        thread: 'conversation',
        callSequence: 1,
        tool: facts.tool ?? 'test.send',
        effects: ['send'],
        cause: facts.cause ?? 'no_rule',
        input: { to: facts.to, body: facts.body ?? 'The mooring fee is paid.', account: 'work' },
        destinations: [{ value: facts.to, replyTarget: false }],
        content: ['body'],
        frame: { context: 'conversation', definitionID: null, sources: ['owner'] },
      });

      await writeRecords(log, [proposal.record]);

      const row = await readProposal(writer.db, proposal.shortID);

      invariant(row, 'the ask opened a proposal');

      return row.id;
    },

    answer: async (
      proposalID: string,
      choice: ProposalAnswerInput['choice'],
      extra: Partial<ProposalAnswerInput> = {},
    ) => {
      const row = await readProposal(writer.db, proposalID);

      invariant(row, 'the proposal exists');

      return answerProposal(
        deps,
        { proposalID, actionHash: row.actionHash, choice, identityID: 'identity-1', ...extra },
        { passkey: { kind: 'host' } },
      );
    },

    // A record forget of the ask: its key goes, and its arguments and destinations with it.
    forgetAsk: async (proposalID: string): Promise<void> => {
      const row = await readProposal(writer.db, proposalID);

      invariant(row, 'the proposal exists');

      const found =
        await sql`select key_id from records where sequence = ${row.createdSequence}`.execute(
          writer.db,
        );

      const keyID = z.object({ key_id: z.string() }).parse(found.rows[0]).key_id;

      await removeRecordKey(log, keyID);
    },

    // A record forget of the proposal that holds the mandate's title.
    forgetMandateTitle: async (mandateID: string): Promise<void> => {
      const found = await sql`select key_id from records
        where kind = 'rules.mandate_proposed' and json_extract(payload, '$.mandateID') = ${mandateID}`.execute(
        writer.db,
      );

      const keyID = z.object({ key_id: z.string() }).parse(found.rows[0]).key_id;

      await removeRecordKey(log, keyID);
    },

    readRuntimeChanges: async () => {
      const found =
        await sql`select reason, changed_by from runtime_rules order by changed_at, change_id`.execute(
          writer.db,
        );

      return z.object({ reason: z.string(), changed_by: z.string() }).array().parse(found.rows);
    },

    decide: async (call: DecidedCall) => {
      const policyCall = await readCall(call);

      return decide(policyCall);
    },

    // Decides a call, and returns a replay of that decision from the snapshot it ran under.
    decideForReplay: async (call: DecidedCall) => {
      const policyCall = await readCall(call);
      const policy = await decide(policyCall);

      return {
        outcome: policy.decision.outcome,
        replay: () =>
          replayDecision(pointOptions, {
            tool: call.tool,
            input: call.args,
            destinations: call.destinations,
            decision: toStoredDecision(policy.decision, policyCall),
            snapshot: policyCall.snapshot,
            at: policyCall.at,
          }),
      };
    },

    rulesContext,

    editProposedRule: (proposalID: string, actionHash: string, rule: unknown) =>
      withWriteTransaction(writer, (tx) =>
        writeProposedRuleEdit(tx, context, { proposalID, actionHash, rule }),
      ),

    proposeMandate: (input: MandateInput, proposedBy: 'owner' | 'nixie' = 'owner') =>
      withWriteTransaction(writer, (tx) =>
        writeMandateProposal(
          tx,
          context,
          { maxHours: 24, readZone: () => Promise.resolve('Australia/Sydney') },
          { input, proposedBy },
        ),
      ),
  };
}
