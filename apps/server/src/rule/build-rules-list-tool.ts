import { collectStandingRules, readMandateList, readRulesInForce } from '@heynixie/definitions';
import type { ListedMandate, StandingRule } from '@heynixie/definitions';
import type { JSONObject } from '@heynixie/log';
import type { RuleCondition } from '@heynixie/policy';
import type { ProposalContext } from '@heynixie/proposals';
import type { ToolDefinition } from '@heynixie/tools';

const rulesListToolName = 'rules.list';
const sentencesSchema = { type: 'array', items: { type: 'string' } } as const;

const conditionProperties = {
  note: {
    type: 'string',
    description: 'what the rule\u2019s condition means, in the author\u2019s words',
  },
  noteBy: { type: 'string', enum: ['you', 'nixie'] },
  words: { type: 'string' },
  source: { type: 'string', description: 'the raw CEL' },
} as const;

const conditionRequired = ['note', 'noteBy', 'words', 'source'] as const;

// Declares read, so the starter rule that allows reads lets it through in the conversation.
export function buildRulesListTool(
  context: Pick<ProposalContext, 'log' | 'clock'>,
): ToolDefinition {
  return {
    name: rulesListToolName,
    description:
      'Lists your mandates and the standing rules that apply to you in this conversation. ' +
      'mandates: the 50 newest, each with its ID, title, state (pending, active, rejected, ' +
      'lapsed, ended or expired), expiry and rules in words. A pending mandate waits for the ' +
      'owner on a card. rules: each allow and ask rule in force for the conversation outside any ' +
      'mandate, with its ID and its words. A mandate rule shows under its mandate. A rule with a ' +
      'condition also shows its note, the condition in words and the raw CEL.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: {
        mandates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mandate: { type: 'string' },
              title: { type: ['string', 'null'], description: 'null once forgotten' },
              state: {
                type: 'string',
                enum: ['pending', 'active', 'rejected', 'lapsed', 'ended', 'expired'],
              },
              expires: { type: 'string', description: 'ISO in UTC' },
              rules: sentencesSchema,
              conditions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { rule: { type: 'integer' }, ...conditionProperties },
                  required: ['rule', ...conditionRequired],
                  additionalProperties: false,
                },
              },
            },
            required: ['mandate', 'title', 'state', 'expires', 'rules', 'conditions'],
            additionalProperties: false,
          },
        },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rule: { type: 'string' },
              sentence: { type: 'string' },
              condition: {
                type: 'object',
                properties: conditionProperties,
                required: [...conditionRequired],
                additionalProperties: false,
              },
            },
            required: ['rule', 'sentence'],
            additionalProperties: false,
          },
        },
      },
      required: ['mandates', 'rules'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { mandates: 'owner_data', rules: 'owner_data' },
    },
    execution: 'direct',
    run: async () => {
      const now = context.clock.now();

      const mandates = await readMandateList(context.log, now);
      const inForce = await readRulesInForce(context.log.writer.db);

      return {
        status: 'ok',
        result: {
          mandates: mandates.map((mandate) => toMandateJSON(mandate)),
          rules: collectStandingRules(inForce, now).map((rule) => toRuleJSON(rule)),
        },
      };
    },
  };
}

function toMandateJSON(mandate: ListedMandate): JSONObject {
  return {
    mandate: mandate.shortID,
    title: mandate.title,
    state: mandate.state,
    expires: new Date(mandate.expires).toISOString(),
    rules: [...mandate.sentences],
    conditions: mandate.conditions.map((condition) => ({
      rule: condition.rule,
      ...toJSONCondition(condition),
    })),
  };
}

function toJSONCondition(condition: RuleCondition): JSONObject {
  return {
    note: condition.note,
    noteBy: condition.noteBy,
    words: condition.words,
    source: condition.source,
  };
}

function toRuleJSON(rule: StandingRule): JSONObject {
  return {
    rule: rule.ruleID,
    sentence: rule.sentence,
    ...(rule.condition === undefined ? {} : { condition: toJSONCondition(rule.condition) }),
  };
}
