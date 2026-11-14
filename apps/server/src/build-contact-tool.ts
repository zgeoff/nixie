import { writeContactMarked } from '@heynixie/policy';
import type { ContactContext } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';

const markArguments = z.object({ destination: z.string(), name: z.string().optional() });

// Declares policy_widen, so stage 4 always asks. An approved action does not run yet, so until it
// does only the CLI marks a contact.
export function buildContactTool(
  context: ContactContext,
  refreshDefinitions: () => Promise<unknown>,
): ToolDefinition {
  return {
    name: 'contacts.mark_known',
    description:
      'Proposes a destination as a known contact, so a later send to it passes the destination ' +
      'limits. The owner approves each proposal.',
    input: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'the address, number or handle to mark' },
        name: { type: 'string', description: 'what to call the contact' },
      },
      required: ['destination'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { contactID: { type: 'string' }, isNew: { type: 'boolean' } },
      required: ['contactID', 'isNew'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['policy_widen'],
      destinations: [],
      amount: null,
      content: [],
      results: { contactID: 'owner_data', isNew: 'owner_data' },
    },
    execution: 'direct',
    run: async (call) => {
      const input = markArguments.parse(call.input);

      const marked = await writeContactMarked(context, {
        destination: input.destination,
        name: input.name ?? null,
      });

      await refreshDefinitions();

      return {
        status: 'ok',
        result: { contactID: marked.contact.contactID, isNew: marked.isNew },
      };
    },
  };
}
