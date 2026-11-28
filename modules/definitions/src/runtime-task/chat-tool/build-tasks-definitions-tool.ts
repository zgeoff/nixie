import { parseJSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { readDefinitionListings } from '../read-definition-listings';
import type { ChatToolOptions } from './chat-tool-options';
import { notReadyMessage } from './chat-tool-options';

// Held by the conversation alone.
export function buildTasksDefinitionsTool(options: ChatToolOptions): ToolDefinition {
  return {
    name: 'tasks.definitions',
    description:
      'Lists every task definition: its ID, name, trigger in words, next fire and ' +
      'tools, whether it is in force, and whether it comes from the definitions repo or from ' +
      'a change made here. A definition that the user stopped, paused or held at a limit shows ' +
      'that hold in held, and no next fire until the user acts on it.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: {
        definitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              definitionID: { type: 'string' },
              name: { type: ['string', 'null'] },
              enabled: { type: 'boolean' },
              isInForce: { type: 'boolean' },
              held: { type: ['string', 'null'], enum: ['stopped', 'paused', 'limit', null] },
              isUnreadable: { type: 'boolean' },
              trigger: { type: ['object', 'null'] },
              rendered: { type: ['string', 'null'] },
              next: { type: ['string', 'null'] },
              tools: { type: 'array', items: { type: 'string' } },
              origin: { type: 'string', enum: ['definitions', 'nixie'] },
            },
            required: [
              'definitionID',
              'name',
              'enabled',
              'isInForce',
              'held',
              'isUnreadable',
              'trigger',
              'rendered',
              'next',
              'tools',
              'origin',
            ],
            additionalProperties: false,
          },
        },
      },
      required: ['definitions'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { definitions: 'owner_data' },
    },
    execution: 'direct',
    run: async () => {
      const context = options.readDefinitions();

      if (context === null) {
        return { status: 'error', message: notReadyMessage };
      }

      const definitions = await readDefinitionListings(context.log.writer.db, {
        now: context.log.writer.clock.now(),
        readZone: options.readZone,
      });

      return { status: 'ok', result: parseJSONObject(JSON.stringify({ definitions })) };
    },
  };
}
