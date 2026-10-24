import { expect, mock, test } from 'bun:test';
import { makeGatedCall } from '@heynixie/testing';
import { buildAPIGate } from './build-api-gate';

test('it passes a request through while the gate is open', async () => {
  const gate = buildAPIGate();

  const response = await gate.run(new Request('http://127.0.0.1/rpc/sessions/list'), () =>
    Promise.resolve(new Response('listed')),
  );

  const text = await response.text();

  expect(text).toBe('listed');
});

test('it answers an API call with 503 once the gate closes, and never calls through', async () => {
  const gate = buildAPIGate();
  const next = mock(() => Promise.resolve(new Response('sent')));

  await gate.close();

  const response = await gate.run(new Request('http://127.0.0.1/rpc/conversation/send'), next);

  expect(response.status).toBe(503);
  expect(next).not.toHaveBeenCalled();
});

test('it passes a health check through once the gate closes', async () => {
  const gate = buildAPIGate();

  await gate.close();

  const response = await gate.run(new Request('http://127.0.0.1/health/live'), () =>
    Promise.resolve(new Response('live')),
  );

  expect(response.status).toBe(200);
});

test('it closes only once the requests in flight have answered', async () => {
  const gate = buildAPIGate();
  const call = makeGatedCall(() => new Response('sent'));
  const inFlight = gate.run(new Request('http://127.0.0.1/rpc/conversation/send'), call.call);

  await call.started;

  const closed = gate.close();
  const statusBefore = Bun.peek.status(closed);

  call.release();

  await Promise.all([inFlight, closed]);

  expect(statusBefore).toBe('pending');
  expect(Bun.peek.status(closed)).toBe('fulfilled');
});

test('it answers a call through its closed answer once the gate closes, and never runs the call', async () => {
  const gate = buildAPIGate();
  const call = mock(() => Promise.resolve('listed'));

  await gate.close();

  const answer = await gate.runCall(call, () => Promise.resolve('refused'));

  expect(answer).toBe('refused');
  expect(call).not.toHaveBeenCalled();
});

test('it closes only once the calls in flight have answered', async () => {
  const gate = buildAPIGate();
  const call = makeGatedCall(() => 'listed');
  const inFlight = gate.runCall(call.call, () => Promise.resolve('refused'));

  await call.started;

  const closed = gate.close();
  const statusBefore = Bun.peek.status(closed);

  call.release();

  await Promise.all([inFlight, closed]);

  expect(statusBefore).toBe('pending');
  expect(Bun.peek.status(closed)).toBe('fulfilled');
});

test('it closes while a health check is still in flight', async () => {
  const gate = buildAPIGate();
  const check = makeGatedCall(() => new Response('ready'));
  const inFlight = gate.run(new Request('http://127.0.0.1/health/ready'), check.call);

  await check.started;

  await gate.close();

  check.release();

  const response = await inFlight;

  expect(response.status).toBe(200);
});
