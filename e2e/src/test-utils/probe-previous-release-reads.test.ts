import { expect, test } from 'bun:test';
import { probePreviousReleaseReads } from './probe-previous-release-reads';

test('it reports a release that writes the oldest reader as able to read', async () => {
  const reads = await probePreviousReleaseReads('v0.78.0', {
    gitDir: new URL('../../..', import.meta.url).pathname,
    oldestReader: 67,
  });

  expect(reads).toBeTrue();
});

test('it reports a release that writes a schema below the oldest reader as unable to read', async () => {
  const reads = await probePreviousReleaseReads('v0.78.0', {
    gitDir: new URL('../../..', import.meta.url).pathname,
    oldestReader: 68,
  });

  expect(reads).toBeFalse();
});
