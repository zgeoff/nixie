import { createApprovedAction, failHeldAction } from '@heynixie/actions';
import { readMessageTimeZone } from '@heynixie/connectors';
import {
  makeMandateHandler,
  makeProposedRuleHandler,
  makeRuleChangeHandler,
  makeRuleProposalHandler,
  runSuggestedRuleCheck,
  writeRuntimeRuleInTransaction,
  writeSuggestedRuleWithdrawal,
} from '@heynixie/definitions';
import type { RecordInput } from '@heynixie/log';
import { makeMcpProposalHandler } from '@heynixie/mcp';
import type { McpPort } from '@heynixie/mcp';
import { makeMemoryProposalHandler } from '@heynixie/memory';
import { makeActionProposalHandler } from '@heynixie/policy';
import type { PromptAnswerContext } from '@heynixie/prompts';
import { makePromptProposalHandler } from '@heynixie/prompts';
import type { ProposalContext, ProposalCoreDeps, ProposalKindHandler } from '@heynixie/proposals';
import { makeSkillProposalHandler } from '@heynixie/skills';
import {
  conversationTaskID,
  readSettlementTarget,
  writeThreadRecordInTransaction,
} from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { APISettings, ReadViewMemory } from '../types';
import { defaultApprovalSettings, defaultPolicySettings } from '../utils/default-api-settings';
import { buildApprovalsProposalConfig } from './build-approvals-proposal-config';
import { proposalsProjection } from './proposals-projection';
import { readActionBodyFields } from './read-action-body-fields';

export type ProposalAPIContext = ProposalContext & {
  readonly settings?: Pick<APISettings, 'approvals' | 'mail' | 'policy'>;

  // Null before the MCP proxy starts. A server's removal waits for it.
  readonly readMcp?: () => McpPort | null;
};

export interface ProposalParts {
  readonly readMemory: ReadViewMemory;

  // the prompts in force and their check, which a prompt override answers against; with none, an
  // override waits for a release that has them
  readonly findPrompts?:
    | (() => Pick<PromptAnswerContext, 'readInForce' | 'checkProposal' | 'wakeExports'> | null)
    | undefined;

  readonly runInForceSeed: () => Promise<unknown>;
}

// The kinds of proposals and what each needs from the server. A kind with no part to run, such as
// memory before it starts, refuses its answers.
export function buildProposalCoreDeps(
  context: ProposalAPIContext,
  parts: ProposalParts,
): ProposalCoreDeps {
  const suggestedRuleSettings =
    context.settings?.policy?.proposedRules ?? defaultPolicySettings.proposedRules;

  const writeThreadRecord = (tx: Transaction<unknown>, input: RecordInput) =>
    writeThreadRecordInTransaction(tx, context, input);

  const handlers: readonly ProposalKindHandler[] = [
    makeActionProposalHandler({
      log: context.log,
      definitions: context.definitions,
      readBodyFields: (_db, request) =>
        readActionBodyFields(context.log, request, context.settings?.mail),
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
      writeSuggestedRuleDecline: (tx, groupHash) =>
        writeSuggestedRuleWithdrawal(tx, context, groupHash),
      runSuggestedRuleCheck: (groupHash) =>
        runSuggestedRuleCheck(
          { ...context, proposalConfig: buildApprovalsProposalConfig(context.settings) },
          suggestedRuleSettings,
          groupHash,
        ),
    }),
    makeMemoryProposalHandler({
      log: context.log,
      definitions: context.definitions,
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
    makeMcpProposalHandler({
      log: context.log,
      definitions: context.definitions,
      now: () => context.clock.now(),
      removeCredentials: async (credentialIDs) => {
        const port = context.readMcp?.() ?? null;

        invariant(port, 'an mcp proposal that removes credentials answers after the proxy starts');

        await port.forgetGrants(credentialIDs);
      },
    }),
    ...buildPromptHandlers(context, parts),
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
        settings: suggestedRuleSettings,
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
    config: buildApprovalsProposalConfig(context.settings),
    conversationThread: conversationTaskID,
    readSettlementTarget: (tx, thread) => readSettlementTarget(tx, thread),
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

function buildPromptHandlers(
  context: ProposalAPIContext,
  parts: ProposalParts,
): readonly ProposalKindHandler[] {
  const prompts = parts.findPrompts?.() ?? null;

  return prompts === null
    ? []
    : [
        makePromptProposalHandler({
          log: context.log,
          clock: context.clock,
          definitions: context.definitions,
          ...prompts,
        }),
      ];
}
