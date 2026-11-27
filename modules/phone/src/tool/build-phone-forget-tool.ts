import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { phoneDeclarations } from '../connector/phone-declarations';
import { phoneToolNames } from '../connector/phone-tool-names';
import type { TextForgetter } from '../types';

const inputSchema = z.strictObject({ text: z.string() });

// phone.forget: erases nixie's copy of one received text, the wakes that showed it and every copy
// in a session. The text stays at the provider.
export function buildPhoneForgetTool(forgetter: TextForgetter): ToolDefinition {
  return {
    name: phoneToolNames.forget,
    description:
      'Forgets one text that your own phone received, for good: its sender and body, and every ' +
      "wake that showed it, are erased from your records and sessions. A forget can't be undone, " +
      'and it needs no approval, because the texts are yours. The text stays at the phone ' +
      "provider. Pass the text's ID from phone.list or a wake. The text is hidden at once, and its " +
      'erasure finishes in the background after your turn.',
    input: {
      type: 'object',
      properties: { text: { type: 'string', description: 'a text ID from phone.list' } },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { text: { type: 'string' }, status: { type: 'string', enum: ['forgetting'] } },
      required: ['text', 'status'],
      additionalProperties: false,
    },
    declaration: phoneDeclarations.forget,
    execution: 'direct',
    run: async (call, toolContext) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const forgotten = await forgetter.forgetBeside({
        text: parsed.data.text,
        thread: toolContext.run.thread,
      });

      if (forgotten.status === 'refused') {
        return { status: 'error', message: `UNKNOWN_TEXT: no text has the ID ${parsed.data.text}` };
      }

      if (forgotten.status === 'unavailable') {
        return { status: 'error', message: 'the forget of a text has not started yet; try again' };
      }

      return {
        status: 'ok',
        result: { text: forgotten.shortID, status: 'forgetting' },
        record: { text: forgotten.shortID },
      };
    },
  };
}
