// The images that the Images workflow builds
export const imageNames = [
  'conversation',
  'fetch',
  'code',
  'computer',
  'render',
  'codex',
  'backup',
  'web',
  'nixie',
] as const;

export type ImageName = (typeof imageNames)[number];

export function isImageName(value: string): value is ImageName {
  return imageNames.some((name) => name === value);
}
