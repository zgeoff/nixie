import type { OwnPlaceSource } from '@heynixie/policy';

// The parts of the deployment config that name nixie's own places. DeploymentConfig satisfies it.
export interface OwnPlaceConfig {
  readonly phone?: { readonly number: string } | undefined;
}

// The places that each feature that is on names as nixie's own. The policy module names no
// feature, so the composition root lists one source here for each feature whose config is set.
export function listOwnPlaceSources(config: OwnPlaceConfig): readonly OwnPlaceSource[] {
  const phone = config.phone;

  return phone === undefined
    ? []
    : [{ read: () => Promise.resolve([{ place: phone.number, name: null }]) }];
}
