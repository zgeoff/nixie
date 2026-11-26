import type { ToolDefinition } from '@heynixie/tools';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailInput } from './make-resolve-gmail-input';
import type { GmailDeps } from './types';

const labelNames = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  maxItems: 20,
} as const;

// gmail.label: adds and removes labels on up to 50 threads of one connection, as a queued write.
// `add` and `remove` take user label names and the system labels INBOX, UNREAD, STARRED and
// IMPORTANT. An `add` that names a user label that does not exist makes it.
export function buildGmailLabelTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.label,
    description:
      'Adds and removes labels on threads of a connected Google account. Remove INBOX to ' +
      'archive, and remove UNREAD to mark read. A label in add that does not exist is made. The ' +
      "change is queued, and the call returns the action's ID.",
    input: {
      type: 'object',
      properties: {
        threads: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description: 'thread IDs, all of one connection',
        },
        add: labelNames,
        remove: labelNames,
        connection: { type: 'string' },
      },
      required: ['threads', 'add', 'remove'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        threads: { type: 'array', items: { type: 'string' } },
        created: { type: ['array', 'null'], items: { type: 'string' } },
      },
      required: ['threads', 'created'],
      additionalProperties: false,
    },
    declaration: gmailDeclarations.label,
    execution: 'queued',
    resolveInput: makeResolveGmailInput(deps.access),
    run: () =>
      Promise.resolve({ status: 'error', message: `${gmailToolNames.label} runs only queued` }),
  };
}
