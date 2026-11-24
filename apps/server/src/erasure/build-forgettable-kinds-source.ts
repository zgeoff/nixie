import type { ErasableDescriptor } from '@heynixie/log';

// The text of the contract's list file: every kind that a record forget may target, in order, with
// a header that tells a reader the file is generated.
export function buildForgettableKindsSource(descriptors: readonly ErasableDescriptor[]): string {
  const kinds = descriptors.flatMap((descriptor) => descriptor.recordKinds.forgettable).toSorted();
  const lines = kinds.map((kind) => `  '${kind}',`).join('\n');

  return `// Generated from the erasable descriptors: write it again with
// \`bun run --cwd apps/server forgettable-kinds\`, never by hand.
export const forgettableKinds = [
${lines}
] as const;
`;
}
