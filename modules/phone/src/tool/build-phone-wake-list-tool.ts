import type { ToolDefinition } from '@heynixie/tools';
import { formatDurationText, readWakeRules } from '@heynixie/triggers';
import { phoneDeclarations } from '../connector/phone-declarations';
import { phoneToolNames } from '../connector/phone-tool-names';
import { phoneSourceID } from '../source/phone-source-id';
import type { PhoneContext } from '../types';

// phone.wake_list: every live rule of the assistant's own phone, whoever set it.
export function buildPhoneWakeListTool(context: PhoneContext): ToolDefinition {
  return {
    name: phoneToolNames.wakeList,
    description:
      'Lists every wake rule of your own phone that has not ended: its ID, what it matches, ' +
      'whom it wakes, when it expires and its window.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: { rules: { type: 'array', items: { type: 'object' } } },
      required: ['rules'],
      additionalProperties: false,
    },
    declaration: phoneDeclarations.wakeList,
    execution: 'direct',
    run: async () => {
      const rules = await readWakeRules(context.log.writer.db, {
        mailbox: { kind: 'source', sourceID: phoneSourceID },
        at: context.clock.now(),
      });

      return {
        status: 'ok',
        result: {
          rules: rules.map((rule) => ({
            rule: rule.shortID,
            match: {
              ...(rule.match.from === undefined ? {} : { from: [...rule.match.from] }),
              ...(rule.match.body === undefined ? {} : { body: rule.match.body }),
            },
            wake: rule.target.kind === 'conversation' ? 'conversation' : rule.target.taskID,
            expiresAt: rule.expiresAt === null ? null : new Date(rule.expiresAt).toISOString(),
            window: formatDurationText(rule.windowMs),
          })),
        },
      };
    },
  };
}
