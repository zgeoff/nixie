import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { collectAcceptedPaths } from './collect-accepted-paths';
import { promptIDs } from './prompt-ids';
import { promptRegistry } from './prompt-registry';
import type { PromptID, PromptOverride, PromptsInForce } from './types';

const readArguments = z.object({ id: z.enum(promptIDs) });

export interface PromptReadContext {
  readonly readInForce: () => Pick<PromptsInForce, 'prompts'> | null;
}

export function buildPromptReadTool(context: PromptReadContext): ToolDefinition {
  return {
    name: 'prompt_read',
    description:
      "Reads one of nixie's built-in prompts: each part's built-in text, the default template " +
      'that arranges the parts, the {{ path }} values each part and the template may read, and ' +
      "the override of each from the owner's definitions in force. Read a prompt before you " +
      'propose an override of it, so the proposal starts from the real text.',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', enum: [...promptIDs], description: 'the prompt to read' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        parts: {
          type: 'array',
          description: 'the parts in the order they fill, so a part may read only those before it',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              text: { type: 'string', description: 'the built-in text' },
              paths: { type: 'array', items: { type: 'string' } },
              override: {
                type: ['string', 'null'],
                description: 'the text the definitions in force put in its place',
              },
            },
            required: ['name', 'text', 'paths', 'override'],
            additionalProperties: false,
          },
        },
        template: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'the default template' },
            paths: { type: 'array', items: { type: 'string' } },
            override: {
              type: ['string', 'null'],
              description: 'the template the definitions in force put in its place',
            },
          },
          required: ['text', 'paths', 'override'],
          additionalProperties: false,
        },
      },
      required: ['id', 'parts', 'template'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { id: 'owner_data', parts: 'owner_data', template: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => {
      const input = readArguments.parse(call.input);

      return Promise.resolve(
        buildPromptOutcome(input.id, context.readInForce()?.prompts[input.id] ?? null),
      );
    },
  };
}

function buildPromptOutcome(id: PromptID, override: PromptOverride | null): ToolOutcome {
  const entry = promptRegistry[id];

  // The registry's entries differ in context type, so their part maps widen to any without a
  // shared annotation.
  const entryParts: Readonly<Record<string, { readonly text: string }>> = entry.parts;

  const parts = Object.entries(entryParts).map(([name, part]) => ({
    name,
    text: part.text,
    paths: collectAcceptedPaths(id, name),
    override: override?.parts[name] ?? null,
  }));

  return {
    status: 'ok',
    result: {
      id,
      parts,
      template: {
        text: entry.template,
        paths: collectAcceptedPaths(id, null),
        override: override?.template ?? null,
      },
    },
  };
}
