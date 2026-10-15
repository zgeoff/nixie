import type { ModelProfile, ModelRole, ModelsConfig } from './types';

// The profile a role uses: the one the role map names, or the conversation's when the role is
// unset.
export function resolveRoleProfile(config: ModelsConfig, role: ModelRole): ModelProfile {
  const profileID = config.roles[role] ?? config.roles.conversation;
  const profile = config.profiles[profileID];

  if (profile === undefined) {
    throw new Error(`the ${role} role names the profile ${profileID}, which is not defined`);
  }

  return profile;
}
