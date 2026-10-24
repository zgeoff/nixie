import { expect, onTestFinished, test } from 'bun:test';
import { SimulatedClock, createActor } from 'xstate';
import { gptLiveCallMachine } from './gpt-live-call-machine.ts';

function setupTest() {
  const clock = new SimulatedClock();
  const call = createActor(gptLiveCallMachine, { clock, input: { quietMs: 2500 } });
  call.start();
  onTestFinished(() => call.stop());
  return { call, clock };
}

test('it waits for the session to open', () => {
  const ctx = setupTest();

  expect(ctx.call.getSnapshot().value).toBe('opening');
});

test('it ends the turn after a quiet spell that follows sound', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });
  ctx.call.send({ type: 'sound' });

  ctx.clock.increment(2500);

  expect(ctx.call.getSnapshot().value).toBe('ended');
});

test('it restarts the quiet spell on each sound', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });
  ctx.call.send({ type: 'sound' });
  ctx.clock.increment(2000);
  ctx.call.send({ type: 'sound' });

  ctx.clock.increment(2000);

  expect(ctx.call.getSnapshot().value).toBe('speaking');
});

test('it never ends a call that has opened with no sound', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });

  ctx.clock.increment(10_000);

  expect(ctx.call.getSnapshot().value).toBe('waiting');
});

test('it fails the call with the error it was given', () => {
  const ctx = setupTest();
  const error = new Error('gpt-live: the socket failed');

  ctx.call.send({ error, type: 'failed' });

  expect(ctx.call.getSnapshot().value).toBe('failed');
  expect(ctx.call.getSnapshot().context.error).toBe(error);
});
