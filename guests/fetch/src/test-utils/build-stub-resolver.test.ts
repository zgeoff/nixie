import { expect, test } from 'bun:test';
import { buildStubResolver } from './build-stub-resolver';

test('it answers each host with its next scripted answer, then with no address', async () => {
  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1'], ['10.0.0.1']] } });

  const first = await resolver.resolveHost('site.test');
  const second = await resolver.resolveHost('site.test');
  const third = await resolver.resolveHost('site.test');

  expect(first).toStrictEqual(['127.0.0.1']);
  expect(second).toStrictEqual(['10.0.0.1']);
  expect(third).toStrictEqual([]);
});

test('it resolves a host it has no answers for to no address', () => {
  const resolver = buildStubResolver({ answers: {} });

  expect(resolver.resolveHost('other.test')).resolves.toStrictEqual([]);
});

test('it records each host it was asked for, in order', async () => {
  const resolver = buildStubResolver({
    answers: { 'site.test': [['127.0.0.1']], 'inside.test': [['10.0.0.5']] },
  });

  await resolver.resolveHost('site.test');
  await resolver.resolveHost('inside.test');

  expect(resolver.hosts).toStrictEqual(['site.test', 'inside.test']);
});

test('it holds each answer for the delay it is given', async () => {
  const resolver = buildStubResolver({ answers: { 'site.test': [['127.0.0.1']] }, delayMs: 50 });
  const started = performance.now();

  await resolver.resolveHost('site.test');

  expect(performance.now() - started).toBeGreaterThanOrEqual(45);
});
