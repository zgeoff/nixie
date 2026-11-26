import type { ToolDefinition } from '@heynixie/tools';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailWakeInput } from './make-resolve-gmail-wake-input';
import type { GmailDeps } from './types';

const durationPattern = '^[1-9][0-9]*(ms|s|m|h|d)$';
const addressPattern = String.raw`^(@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$`;

// gmail.wake_set: a wake rule on a connected Gmail account, as a call under policy that asks by
// default. Gmail stays at Google, so a rule keeps nothing of a mail that it does not match.
export function buildGmailWakeSetTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.wakeSet,
    description:
      'Sets a wake rule on a connected Google account: Gmail mail is silent until a rule matches ' +
      'it. The rule wakes the conversation or a task when a mail matches from (addresses, or ' +
      '@domain), subject (a word) or thread (a Gmail thread ID), and stays until expires passes, ' +
      'or until you cancel it when you give no expires. A match wakes its target at once, unless ' +
      'the rule woke it within its window, and then it waits and arrives with the later ones in ' +
      'one wake. wake names the target: conversation or a task ID, and it defaults to you. The ' +
      'call is queued: the rule starts when it is approved and runs, and it never matches a mail ' +
      'that came before, so search for those with gmail.search.',
    input: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'string', pattern: addressPattern }, minItems: 1 },
        subject: { type: 'string', minLength: 1 },
        thread: { type: 'string', description: 'a thread ID from gmail.search or gmail.read' },
        wake: { type: 'string', description: 'conversation, or the ID of a task' },
        expires: {
          type: 'string',
          pattern: durationPattern,
          description: 'from 1m, such as 30m or 7d; none stays',
        },
        window: {
          type: 'string',
          pattern: durationPattern,
          description: 'from 1m, such as 1m or 15m; at most expires',
        },
        connection: { type: 'string' },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        rule: { type: 'string' },
        expiresAt: { type: ['string', 'null'] },
        window: { type: 'string' },
        replaced: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    declaration: gmailDeclarations.wakeSet,
    execution: 'queued',
    resolveInput: makeResolveGmailWakeInput(deps),
    run: () =>
      Promise.resolve({ status: 'error', message: `${gmailToolNames.wakeSet} runs only queued` }),
  };
}
