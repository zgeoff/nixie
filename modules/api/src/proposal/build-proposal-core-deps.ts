import { createApprovedAction, failHeldAction } from '@heynixie/actions';
import { readMessageTimeZone } from '@heynixie/connectors';
import {
  makeMandateHandler,
  makeProposedRuleHandler,
  makeRuleChangeHandler,
  makeRuleProposalHandler,
  runGapCheck,
  writeGapWithdrawal,
  writeRuntimeRuleInTransaction,
} from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { makeMemoryProposalHandler } from '@heynixie/memory';
import { makeActionProposalHandler } from '@heynixie/policy';
import type { ProposalContext, ProposalCoreDeps, ProposalKindHandler } from '@heynixie/proposals';
import { makeSkillProposalHandler } from '@heynixie/skills';
import { writeThreadRecordInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { APISettings, ReadViewMemory } from '../types';
import { defaultApprovalSettings, defaultPolicySettings } from '../utils/default-api-settings';
import { proposalsProjection } from './proposals-projection';
import { readForgetBodyFields } from './read-forget-body-fields';

export type ProposalAPIContext = ProposalContext & {
  readonly settings?: Pick<APISettings, 'approvals' | 'policy'>;
};

export interface ProposalParts {
  readonly readMemory: ReadViewMemory;
  readonly runInForceSeed: () => Promise<unknown>;
}

const memoryLapseMs = 14 * 24 * 60 * 60 * 1000;

// The kinds of proposals and what each needs from the server. A kind with no part to run, such as
// memory before it starts, refuses its answers.
export function buildProposalCoreDeps(
  context: ProposalAPIContext,
  parts: ProposalParts,
): ProposalCoreDeps {
  const gapSettings =
    context.settings?.policy?.proposedRules ?? defaultPolicySettings.proposedRules;

  const writeThreadRecord = (tx: Transaction<unknown>, input: RecordInput) =>
    writeThreadRecordInTransaction(tx, context, input);

  const handlers: readonly ProposalKindHandler[] = [
    makeActionProposalHandler({
      log: context.log,
      definitions: context.definitions,
      readBodyFields: (_db, request) => readForgetBodyFields(context.log, request),
      writeThreadRecord,
      queueApproved: (tx, approved) => createApprovedAction(tx, context, approved),
      failHeld: (tx, row, reason) => failHeldAction(tx, context, { proposalID: row.id, reason }),
      writeRule: async (tx, change) => {
        await writeRuntimeRuleInTransaction(tx, context, {
          ruleID: change.ruleID,
          rule: change.rule,
          changedBy: 'owner',
          reason: change.reason,
        });
      },
      runAfterRule: parts.runInForceSeed,
      writeGapDecline: (tx, groupHash) => writeGapWithdrawal(tx, context, groupHash),
      runGapCheck: (groupHash) => runGapCheck(context, gapSettings, groupHash),
    }),
    makeMemoryProposalHandler({
      log: context.log,
      definitions: context.definitions,
      lapseIntervalMs: memoryLapseMs,
      readStore: () => {
        const store = parts.readMemory();

        return store === null
          ? null
          : {
              proposals: store.proposals,
              readTexts: async () => {
                const listed = await store.view.readProposals();

                return new Map(listed.map((proposal) => [proposal.proposalID, proposal.text]));
              },
            };
      },
    }),
    makeSkillProposalHandler({
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      runInForceSeed: async () => {
        await parts.runInForceSeed();
      },
    }),
    makeRuleChangeHandler({
      rule_widening: makeRuleProposalHandler({
        log: context.log,
        clock: context.clock,
        definitions: context.definitions,
        runInForceSeed: parts.runInForceSeed,
      }),
      proposed_rule: makeProposedRuleHandler({
        log: context.log,
        clock: context.clock,
        definitions: context.definitions,
        runInForceSeed: parts.runInForceSeed,
        settings: gapSettings,
      }),
      mandate: makeMandateHandler({
        log: context.log,
        clock: context.clock,
        definitions: context.definitions,
        runInForceSeed: parts.runInForceSeed,
      }),
    }),
  ];

  const settings = context.settings?.approvals ?? defaultApprovalSettings;

  return {
    log: context.log,
    clock: context.clock,
    definitions: context.definitions,
    projection: proposalsProjection,
    handlers: new Map(handlers.map((handler) => [handler.family, handler])),
    readDeferContext: async (tx) => {
      const messageZone = await readMessageTimeZone({ writer: { ...context.log.writer, db: tx } });

      return { quietHours: settings.quietHours, zone: messageZone ?? settings.defaultZone };
    },
    writeThreadRecord,
  };
}
