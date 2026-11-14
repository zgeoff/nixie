import { expect, test } from 'bun:test';
import { collectTaskWaitSources } from './collect-task-wait-sources';

test.each([
  ['answered', ['open']],
  ['released', ['open']],
  ['open', []],
  ['none', []],
] as const)('it lets a wait move to %s only from %j', (to, sources) => {
  expect(collectTaskWaitSources(to)).toStrictEqual(sources);
});
