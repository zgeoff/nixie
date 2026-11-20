import type { TestImpd } from '@impz/testing';

// A secret that impd holds for each host, as a rule of its own: a request to the host takes the
// value in its x-api-key header.
export async function seedSecret(
  impd: Pick<TestImpd, 'client'>,
  name: string,
  hosts: readonly string[],
): Promise<void> {
  await impd.client.secrets.add(buildSecretInput(name, hosts));
}

// Adds the secret again with other rules and a rebind, as a rotation to a new header does, which
// takes its grant from every imp.
export async function rebindSecret(
  impd: Pick<TestImpd, 'client'>,
  name: string,
  hosts: readonly string[],
): Promise<void> {
  const input = buildSecretInput(name, hosts);

  await impd.client.secrets.add({
    ...input,
    rules: hosts.map((host) => ({ host, header: 'authorization', scheme: 'bearer' as const })),
    replace: true,
    rebind: true,
  });
}

function buildSecretInput(name: string, hosts: readonly string[]) {
  return {
    name,
    kind: 'custom' as const,
    value: 'not-a-real-value',
    rules: hosts.map((host) => ({ host, header: 'x-api-key', scheme: 'raw' as const })),
  };
}
