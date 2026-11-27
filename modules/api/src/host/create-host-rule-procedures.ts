import type { RuleContext, RuleInForceEntry, StoredRule } from '@heynixie/definitions';
import {
  pickNoteAuthor,
  readMandateAuthors,
  readPendingRuleProposals,
  readRuleConflicts,
  readRuleVersions,
  readRulesInForce,
  writeRuleResolution,
} from '@heynixie/definitions';
import { describeCondition, renderRule } from '@heynixie/policy';
import { runRuleProposalAnswer } from '../proposal/run-rule-proposal-answer';
import { buildRuleProposalEntry } from '../utils/build-rule-proposal-entry';
import { toConditionField } from '../utils/to-condition-field';
import { hostImplementer } from './host-implementer';

export function createHostRuleProcedures(context: RuleContext) {
  const rules = hostImplementer.rules;

  return {
    list: rules.list.handler(async () => {
      const inForce = await readRulesInForce(context.log.writer.db);
      const authors = await readMandateAuthors(context.log);

      return inForce.map((entry) => buildRuleEntry(entry, authors));
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

      if (resolved.status === 'refused') {
        const buildNotFound = options.errors.NOT_FOUND;

        throw buildNotFound({ message: resolved.reason });
      }

      return {
        ruleID: options.input.ruleID,
        changeID: resolved.changeID,
        keep: options.input.keep,
      };
    }),

    proposals: {
      list: rules.proposals.list.handler(async () => {
        const pending = await readPendingRuleProposals(context.log.writer.db, context.clock.now());

        const hashes = pending.flatMap((entry) =>
          entry.proposal.changes.flatMap((change) => [change.before?.hash, change.after?.hash]),
        );

        const versions = await readRuleVersions(
          context.log.writer.db,
          hashes.filter((hash) => hash !== undefined),
        );

        return pending.map((entry) => buildRuleProposalEntry(entry, versions));
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

function buildRuleEntry(entry: RuleInForceEntry, authors: ReadonlyMap<string, 'you' | 'nixie'>) {
  return {
    ruleID: entry.ruleID,
    revision: entry.revision,
    ruleHash: entry.rule.hash,
    sentence: renderRule(entry.rule.rule),
    ...toConditionField(
      describeCondition(entry.rule.rule, pickNoteAuthor(entry.rule.rule, authors)),
    ),
    origin: entry.origin,
    changeID: entry.changeID,
    lastFiredAt: entry.lastFiredAt === null ? null : new Date(entry.lastFiredAt),
  };
}

function toRuleVersion(stored: StoredRule | null) {
  return stored === null
    ? null
    : {
        ruleHash: stored.hash,
        sentence: renderRule(stored.rule),
        ...toConditionField(describeCondition(stored.rule, 'you')),
      };
}
