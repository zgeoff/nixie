import { expect, test } from 'bun:test';
import { buildTestCredentialChecks } from './build-test-credential-checks';

test('it answers a .test host with a public address when no site is given', async () => {
  const checks = buildTestCredentialChecks(null);

  const addresses = await checks.resolveHost('kagi.test');

  expect(addresses).toStrictEqual(['93.184.216.34']);
});

test("it resolves a site's name to the loopback address", async () => {
  const checks = buildTestCredentialChecks({ names: ['lantern.test'], ca: 'fake-ca' });

  const addresses = await checks.resolveHost('lantern.test');

  expect(addresses).toStrictEqual(['127.0.0.1']);
});

test('it refuses to resolve a host that is not a name of the site', () => {
  const checks = buildTestCredentialChecks({ names: ['lantern.test'], ca: 'fake-ca' });

  expect(checks.resolveHost('kagi.test')).rejects.toThrowWithMessage(
    Error,
    /kagi\.test is not a name of the test site/u,
  );
});

test.each([
  { address: '127.0.0.1', isAllowed: true },
  { address: '93.184.216.34', isAllowed: false },
])('it allows the address $address when a site is given: $isAllowed', (row) => {
  const checks = buildTestCredentialChecks({ names: ['lantern.test'], ca: 'fake-ca' });

  expect(checks.test?.checkAddress?.(row.address)).toBe(row.isAllowed);
});
