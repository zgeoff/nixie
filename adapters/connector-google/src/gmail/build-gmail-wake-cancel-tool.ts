import { endWakeRuleInTransaction, readWakeRules } from '@heynixie/connections';
import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildGmailMailbox } from './build-gmail-mailbox';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import type { GmailDeps } from './types';

const inputSchema = z.strictObject({ rule: z.string() });

// gmail.wake_cancel: ends a live rule of any connected account. It takes the connection from the
// rule, and refuses UNKNOWN_RULE for a rule of another mailbox. A cancel only narrows what wakes the
// assistant, so it never asks. The matches that the rule held still arrive in a later wake.
export function buildGmailWakeCancelTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.wakeCancel,
    description:
      'Cancels a wake rule of a connected Google account, whoever set it. Mail that the rule ' +
      'already held still arrives in one later wake, and no later mail matches it.',
    input: {
      type: 'object',
      properties: { rule: { type: 'string', description: 'a rule ID from gmail.wake_list' } },
      required: ['rule'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { rule: { type: 'string' }, ended: { type: 'boolean' } },
      required: ['rule', 'ended'],
      additionalProperties: false,
    },
    declaration: gmailDeclarations.wakeCancel,
    execution: 'direct',
    run: async (call) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const live = await deps.access.readLiveContexts();

      for (const context of live) {
        const rules = await readWakeRules(deps.log.writer.db, {
          mailbox: buildGmailMailbox(context.connectionID),
          at: deps.clock.now(),
        });

        const rule = rules.find((entry) => entry.shortID === parsed.data.rule);

        if (rule !== undefined) {
          await withWriteTransaction(deps.log.writer, (tx) =>
            endWakeRuleInTransaction(tx, deps.wake.context(), rule.ruleID, 'cancelled'),
          );

          return { status: 'ok', result: { rule: rule.shortID, ended: true } };
        }
      }

      return {
        status: 'error',
        message: `UNKNOWN_RULE: no live rule of a Google account has the ID ${parsed.data.rule}`,
      };
    },
  };
}
