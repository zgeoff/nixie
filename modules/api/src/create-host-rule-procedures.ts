import type { RuleContext, RuleInForceEntry, StoredRule } from '@heynixie/definitions';
import {
  readPendingRuleProposals,
  readRuleConflicts,
  readRulesInForce,
  writeRuleResolution,
} from '@heynixie/definitions';
import { renderRule } from '@heynixie/policy';
import { buildRuleProposalEntry } from './build-rule-proposal-entry';
import { hostImplementer } from './host-implementer';
import { runRuleProposalAnswer } from './run-rule-proposal-answer';

export function createHostRuleProcedures(context: RuleContext) {
  const rules = hostImplementer.rules;

  return {
    list: rules.list.handler(async () => {
      const inForce = await readRulesInForce(context.log.writer.db);

      return inForce.map((entry) => buildRuleEntry(entry));
    }),

    conflicts: rules.conflicts.handler(async () => {
      const conflicts = await readRuleConflicts(context.log.writer.db);

      return conflicts.map((change) => ({
        ruleID: change.ruleID,
        changeID: change.changeID,
        nixie: toRuleVersion(change.rule),
        repo: toRuleVersion(change.beneath),
        base: toRuleVersion(change.base),
        changedBy: change.changedBy,
        reason: change.reason,
        changedAt: new Date(change.changedAt),
      }));
    }),

    resolve: rules.resolve.handler(async (options) => {
      const resolved = await writeRuleResolution(context, options.input);

      return {
        ruleID: options.input.ruleID,
        changeID: resolved.changeID,
        keep: options.input.keep,
      };
    }),

    proposals: {
      list: rules.proposals.list.handler(async () => {
        const pending = await readPendingRuleProposals(context.log.writer.db, context.clock.now());

        return pending.map((entry) => buildRuleProposalEntry(entry));
      }),

      approve: rules.proposals.approve.handler((options) =>
        runRuleProposalAnswer(context, { answer: 'approve', ...options.input }, options.errors),
      ),

      reject: rules.proposals.reject.handler((options) =>
        runRuleProposalAnswer(context, { answer: 'reject', ...options.input }, options.errors),
      ),
    },
  };
}

function buildRuleEntry(entry: RuleInForceEntry) {
  return {
    ruleID: entry.ruleID,
    revision: entry.revision,
    ruleHash: entry.rule.hash,
    sentence: renderRule(entry.rule.rule),
    origin: entry.origin,
    changeID: entry.changeID,
    lastFiredAt: entry.lastFiredAt === null ? null : new Date(entry.lastFiredAt),
  };
}

function toRuleVersion(stored: StoredRule | null) {
  return stored === null ? null : { ruleHash: stored.hash, sentence: renderRule(stored.rule) };
}
