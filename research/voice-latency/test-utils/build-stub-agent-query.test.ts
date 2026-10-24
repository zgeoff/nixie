import { expect, test } from 'bun:test';
import { buildStubAgentQuery } from './build-stub-agent-query.ts';

test('it answers each prompt with the next scripted turn and records the prompt', async () => {
  const stub = buildStubAgentQuery([[{ type: 'first' }], [{ type: 'second' }, { type: 'third' }]]);
  const session = stub.query({
    options: {},
    prompt: (async function* () {
      yield { message: { content: 'Hello', role: 'user' }, parent_tool_use_id: null, type: 'user' } as const;
      yield { message: { content: 'Again', role: 'user' }, parent_tool_use_id: null, type: 'user' } as const;
    })(),
  });

  const received = await Array.fromAsync(session);

  expect(received).toStrictEqual([{ type: 'first' }, { type: 'second' }, { type: 'third' }]);
  expect(stub.prompts).toStrictEqual(['Hello', 'Again']);
});

test('it fails a prompt past the script', async () => {
  const stub = buildStubAgentQuery([]);
  const session = stub.query({
    options: {},
    prompt: (async function* () {
      yield { message: { content: 'Hello', role: 'user' }, parent_tool_use_id: null, type: 'user' } as const;
    })(),
  });

  expect(Array.fromAsync(session)).rejects.toThrow('the stub has no turn for prompt 1');
});
