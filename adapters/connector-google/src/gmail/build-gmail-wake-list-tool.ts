import { formatDurationText, readWakeRules } from '@heynixie/connections';
import type { JSONObject, ToolDefinition } from '@heynixie/connections';
import { buildGmailMailbox } from './build-gmail-mailbox';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailInput } from './make-resolve-gmail-input';
import { readCallContext } from './read-call-context';
import type { GmailDeps } from './types';

// gmail.wake_list: every live rule of one connection, whoever set it, with its target.
export function buildGmailWakeListTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.wakeList,
    description:
      'Lists every wake rule of a connected Google account that has not ended: its ID, what it ' +
      'matches, whom it wakes, when it expires, its window, and whether you set it or a send did.',
    input: {
      type: 'object',
      properties: { connection: { type: 'string' } },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { rules: { type: 'array', items: { type: 'object' } } },
      required: ['rules'],
      additionalProperties: false,
    },
    declaration: gmailDeclarations.wakeList,
    execution: 'direct',
    resolveInput: makeResolveGmailInput(deps.access),
    run: async (call) => {
      const context = await readCallContext(deps.access, call.input);

      if (context === null) {
        return { status: 'error', message: 'UNKNOWN_CONNECTION: no live connection has that ID' };
      }

      const rules = await readWakeRules(deps.log.writer.db, {
        mailbox: buildGmailMailbox(context.connectionID),
        at: deps.clock.now(),
      });

      return {
        status: 'ok',
        result: {
          rules: rules.map((rule): JSONObject => ({
            rule: rule.shortID,
            match: {
              ...(rule.match.from === undefined ? {} : { from: [...rule.match.from] }),
              ...(rule.match.subject === undefined ? {} : { subject: rule.match.subject }),
              ...(rule.match.thread === undefined ? {} : { thread: rule.match.thread }),
            },
            wake: rule.target.kind === 'conversation' ? 'conversation' : rule.target.taskID,
            expiresAt: rule.expiresAt === null ? null : new Date(rule.expiresAt).toISOString(),
            window: formatDurationText(rule.windowMs),
            origin: rule.origin,
          })),
        },
      };
    },
  };
}
