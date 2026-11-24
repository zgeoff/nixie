export const modelSecretPrefix = 'nixie-model-';

// impd caps a name at 31 characters, and a profile ID has no length cap, so the profile goes into
// the digest and the name keeps one length for every profile.
export const modelSecretNameLength = 31;
