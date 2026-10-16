import type { Effect, EffectDeclaration } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import type { TestServerTools } from './start-test-server';

export interface TestNotesTools {
  readonly tools: TestServerTools;

  // changes the effects the policy declares for the notes tool, which the next call's decision reads
  readonly setEffects: (effects: readonly Effect[]) => void;

  // a stand-in for the policy hash, which names the effects the policy declares
  readonly getPolicyHash: () => string;
}

// Builds notes_read, a direct tool that returns the note given, and the fixed rules' decision point
// over a declaration of it that starts as a read, so a test can change the policy between two calls.
export function buildTestNotesTools(note: string): TestNotesTools {
  const declared: { effects: readonly Effect[] } = { effects: ['read'] };

  return {
    tools: {
      definitions: [
        {
          name: 'notes_read',
          description: 'Reads the note you kept last.',
          input: { type: 'object', properties: {}, additionalProperties: false },
          output: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
          declaration: buildNotesDeclaration(['read']),
          execution: 'direct',
          run: () => Promise.resolve({ status: 'ok', result: { text: note } }),
        },
      ],
      decide: makeDecisionPoint({
        findDeclaration: (tool) =>
          tool === 'notes_read' ? buildNotesDeclaration(declared.effects) : null,
      }),
    },
    setEffects: (effects) => {
      declared.effects = effects;
    },
    getPolicyHash: () => `policy:${declared.effects.join('+')}`,
  };
}

function buildNotesDeclaration(effects: readonly Effect[]): EffectDeclaration {
  return { effects, destinations: [], amount: null, content: [], results: { text: 'owner_data' } };
}
