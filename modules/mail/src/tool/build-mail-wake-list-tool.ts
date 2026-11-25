import type { ToolDefinition } from '@heynixie/tools';
import { readWakeRules } from '@heynixie/triggers';
import { mailDeclarations } from '../connector/mail-declarations';
import { mailToolNames } from '../connector/mail-tool-names';
import type { MailContext } from '../types';
import { formatDurationText } from './format-duration-text';

// mail.wake_list: every live rule of the assistant's own mailbox, whoever set it.
export function buildMailWakeListTool(context: MailContext): ToolDefinition {
  return {
    name: mailToolNames.wakeList,
    description:
      'Lists every wake rule of your own mailbox that has not ended: its ID, what it matches, ' +
      'whom it wakes, when it expires, its window, and whether you set it or a send did.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: { type: 'object' },
    declaration: mailDeclarations.wakeList,
    execution: 'direct',
    run: async () => {
      const rules = await readWakeRules(context.log.writer.db, {
        mailbox: { kind: 'mail' },
        at: context.clock.now(),
      });

      return {
        status: 'ok',
        result: {
          rules: rules.map((rule) => ({
            rule: rule.shortID,
            match: {
              ...(rule.match.from === undefined ? {} : { from: [...rule.match.from] }),
              ...(rule.match.subject === undefined ? {} : { subject: rule.match.subject }),
              ...(rule.match.thread === undefined ? {} : { thread: rule.match.thread }),
            },
            wake: rule.target.kind === 'conversation' ? 'conversation' : rule.target.taskID,
            expiresAt: rule.expiresAt === null ? null : new Date(rule.expiresAt).toISOString(),
            window: formatDurationText(rule.windowMs),
            origin: rule.origin === 'reply' ? 'reply' : 'tool',
          })),
        },
      };
    },
  };
}
