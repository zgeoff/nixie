import type { ResolvedProfile } from '@heynixie/models';
import { buildGatewayBaseURL } from '@heynixie/spend';
import type { TurnProfile } from '@heynixie/wire';

export interface RoutedModelInput {
  // whether the gateway counts every model request
  readonly isRouted: boolean;
  readonly profile: ResolvedProfile;
  readonly turnProfile: TurnProfile;
  readonly sandboxName: string;
}

export interface RoutedModel {
  readonly profile: ResolvedProfile;
  readonly turnProfile: TurnProfile;
}

// When the gateway counts every request, a sandbox sends its model requests to the profile's base
// URL followed by the sandbox's name and the profile's ID. Otherwise nothing changes.
export function buildRoutedModel(input: RoutedModelInput): RoutedModel {
  if (!input.isRouted) {
    return { profile: input.profile, turnProfile: input.turnProfile };
  }

  const baseURL = buildGatewayBaseURL(input.profile.profile.baseURL, {
    sandboxName: input.sandboxName,
    profileID: input.profile.profile.id,
  });

  return {
    profile: { ...input.profile, profile: { ...input.profile.profile, baseURL } },
    turnProfile: { ...input.turnProfile, baseURL },
  };
}
