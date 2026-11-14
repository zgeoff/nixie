import { expect, test } from 'bun:test';
import { agentConfigSchema } from './agent-config-schema';

test("it reads the agent's names", () => {
  const result = agentConfigSchema.safeParse({ names: ['Nix', 'Nixie'] });

  expect(result.data).toStrictEqual({ names: ['Nix', 'Nixie'] });
});

test('it reads no names when the section sets none', () => {
  const result = agentConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({ names: [] });
});

test('it refuses an empty name', () => {
  const result = agentConfigSchema.safeParse({ names: ['Nix', ''] });

  expect(result.error?.issues).toPartiallyContain({ path: ['names', 1] });
});

test('it refuses a key the section does not have', () => {
  const result = agentConfigSchema.safeParse({ names: ['Nix'], persona: 'persona.md' });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});
