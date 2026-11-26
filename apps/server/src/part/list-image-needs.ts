import { bindHarness, modelRoles, resolveRoleProfile } from '@heynixie/models';
import type { HarnessProfile } from '@heynixie/models';
import type { SandboxImageKey } from '@heynixie/sandbox';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';
import { listFeaturesOn } from '../feature/list-features-on';
import type { AnyPartDeclaration } from '../types';
import { planParts } from './plan-parts';
import type { ServerPartValues } from './server-part-values';

export interface ImageNeed {
  readonly key: SandboxImageKey;

  // what needs the image, such as "the profile chat-main on the agent-sdk harness" or
  // "the web_fetch part"
  readonly neededBy: string;

  // set for an image that the part uses when the manifest holds it, and does without otherwise
  readonly isOptional?: true;
}

// One need per configured profile, from its harness record, then one per key that a part in the
// plan names. A configured profile is the profile each role resolves to and each profile a
// selectable model names.
export function listImageNeeds(
  config: DeploymentConfig,
  declarations: readonly AnyPartDeclaration<ServerPartValues>[],
): readonly ImageNeed[] {
  const profiles = new Map<string, HarnessProfile>();

  for (const role of modelRoles) {
    const profile = resolveRoleProfile(config.models, role);

    profiles.set(profile.id, profile);
  }

  for (const selectable of config.models.selectable) {
    const profile = config.models.profiles[selectable.profile];

    if (profile !== undefined) {
      profiles.set(profile.id, profile);
    }
  }

  const needs: ImageNeed[] = [...profiles.values()].map((profile) => {
    const harness = bindHarness(profile);

    return {
      key: harness.imageKey,
      neededBy: `the profile ${profile.id} on the ${harness.id} harness`,
    };
  });

  const planned = planParts(listFeaturesOn(config), declarations).parts;

  for (const declaration of planned) {
    for (const key of declaration.images?.(config) ?? []) {
      needs.push({ key, neededBy: `the ${declaration.name} part` });
    }

    for (const key of declaration.optionalImages?.(config) ?? []) {
      needs.push({ key, neededBy: `the ${declaration.name} part`, isOptional: true });
    }
  }

  return needs;
}
