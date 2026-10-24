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

test('it stays open through the quiet spell while a delegated request is pending', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });
  ctx.call.send({ type: 'sound' });
  ctx.call.send({ type: 'delegated' });

  ctx.clock.increment(5000);

  expect(ctx.call.getSnapshot().value).toBe('speaking');
});

test('it waits for the delegated answer to be spoken after it arrives', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });
  ctx.call.send({ type: 'sound' });
  ctx.call.send({ type: 'delegated' });
  ctx.clock.increment(5000);
  ctx.call.send({ type: 'answered' });

  ctx.clock.increment(5000);

  expect(ctx.call.getSnapshot().value).toBe('waiting');
});

test('it ends the turn after the quiet spell that follows the spoken answer', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });
  ctx.call.send({ type: 'sound' });
  ctx.call.send({ type: 'delegated' });
  ctx.clock.increment(5000);
  ctx.call.send({ type: 'answered' });
  ctx.call.send({ type: 'sound' });
  ctx.clock.increment(2000);
  const beforeQuiet = ctx.call.getSnapshot().value;

  ctx.clock.increment(500);

  expect(beforeQuiet).toBe('speaking');
  expect(ctx.call.getSnapshot().value).toBe('ended');
});

test('it keeps the turn open until every one of two delegated requests is answered', () => {
  const ctx = setupTest();
  ctx.call.send({ type: 'opened' });
  ctx.call.send({ type: 'delegated' });
  ctx.call.send({ type: 'delegated' });
  ctx.call.send({ type: 'answered' });
  ctx.call.send({ type: 'sound' });

  ctx.clock.increment(5000);

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
