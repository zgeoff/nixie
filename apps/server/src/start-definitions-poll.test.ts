import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { startDefinitionsPoll } from './start-definitions-poll';

test('it seeds on each new probe token and not on a repeated one', async () => {
  const tokens = ['rev-1', 'rev-1', 'rev-2'];
  const probes: string[] = [];
  const seed = mock(() => Promise.resolve());
  const poll = startDefinitionsPoll({
    probe: () => {
      const token = tokens.shift() ?? 'rev-2';

      probes.push(token);
      return Promise.resolve(token);
    },
    seed,
    intervalMs: 1,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  await waitForCondition(() => probes.length >= 4);

  expect(seed).toHaveBeenCalledTimes(2);
});

test('it reports a probe that throws and keeps polling', async () => {
  const errors: unknown[] = [];
  const probes: number[] = [];
  const poll = startDefinitionsPoll({
    probe: () => {
      probes.push(probes.length);
      return Promise.reject(new Error('the definitions directory is gone'));
    },
    seed: () => Promise.resolve(),
    intervalMs: 1,
    onError: (error) => {
      errors.push(error);
    },
  });

  onTestFinished(() => poll.stop());

  await waitForCondition(() => probes.length >= 2);

  expect(errors).toIncludeAllMembers([new Error('the definitions directory is gone')]);
});
