// The one list of switchable features. Every union and schema of a feature derives from it.
export const featureIDs = [
  'computer',
  'code',
  'voice',
  'devices',
  'google',
  'mcp',
  'coding',
  'search',
  'images',
  'mail',
  'spend',
] as const;

export type FeatureID = (typeof featureIDs)[number];
