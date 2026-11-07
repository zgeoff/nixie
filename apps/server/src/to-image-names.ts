import type { SandboxImages } from './load-sandbox-manifest';

export function toImageNames(images: SandboxImages): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(images).map(([key, image]) => [key, image.name]));
}
