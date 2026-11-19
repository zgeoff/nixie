import { collectStandingRules, readMandateList, readRulesInForce } from '@heynixie/definitions';
import type { ListedMandate } from '@heynixie/definitions';
import type { JSONObject } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import type { ToolDefinition } from '@heynixie/tools';

const rulesListToolName = 'rules.list';
const sentencesSchema = { type: 'array', items: { type: 'string' } } as const;

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
      'mandate, with its ID and its words. A mandate rule shows under its mandate.',
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
            },
            required: ['mandate', 'title', 'state', 'expires', 'rules'],
            additionalProperties: false,
          },
        },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: { rule: { type: 'string' }, sentence: { type: 'string' } },
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
          rules: collectStandingRules(inForce, now).map((rule) => ({
            rule: rule.ruleID,
            sentence: rule.sentence,
          })),
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
  };
}
