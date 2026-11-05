import { expect, test } from 'bun:test';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildSilentEndTool } from './build-silent-end-tool';
import { buildTurnSilence } from './build-turn-silence';

test('it ends a turn that a timer woke, and tells the model to write nothing more', async () => {
  const tool = buildSilentEndTool({ ownerName: 'Robin' });
  const silence = buildTurnSilence([{ kind: 'timer.fired', thread: 'conversation', payload: {} }]);

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'turn.end_silently', input: {} }),
    buildMockToolContext({
      run: {
        session: { key: 'c41d5e6f', invalidatedThrough: 0, endSilently: silence.end },
      },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      note: 'This turn ends with nothing sent. Write no more text: nixie keeps no reply from this turn.',
    },
  });
});

test("it refuses to end a turn that holds the owner's message, and tells the model to reply", async () => {
  const tool = buildSilentEndTool({ ownerName: 'Robin' });

  const silence = buildTurnSilence([
    { kind: 'owner_message', thread: 'conversation', payload: {} },
  ]);

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'turn.end_silently', input: {} }),
    buildMockToolContext({
      run: {
        session: { key: 'c41d5e6f', invalidatedThrough: 0, endSilently: silence.end },
      },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'this turn has a message from Robin, so reply',
  });
});

test('it calls the owner the owner in its refusal when the deployment names nobody', async () => {
  const tool = buildSilentEndTool({ ownerName: null });

  const silence = buildTurnSilence([
    { kind: 'owner_message', thread: 'conversation', payload: {} },
  ]);

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'turn.end_silently', input: {} }),
    buildMockToolContext({
      run: {
        session: { key: 'c41d5e6f', invalidatedThrough: 0, endSilently: silence.end },
      },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'this turn has a message from the owner, so reply',
  });
});

test('it refuses a call that comes from no model turn', async () => {
  const tool = buildSilentEndTool({ ownerName: 'Robin' });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'turn.end_silently', input: {} }),
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'only a model turn can end silently',
  });
});
