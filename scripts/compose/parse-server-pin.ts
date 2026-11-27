// Every nixie server image a recipe names, by tag and digest. The web and backup images carry a
// suffix after `nixie`, so the pattern skips them.
const serverPinPattern = /ghcr\.io\/zgeoff\/nixie:(?<version>\d+\.\d+\.\d+)@sha256:[0-9a-f]{64}/gu;

export type ServerPin = { readonly version: string } | { readonly problem: string };

// The release whose server image a recipe pins. A recipe that names no server image, or names two
// releases, has no one schema to check its config against.
export function parseServerPin(text: string): ServerPin {
  const versions = new Set(
    [...text.matchAll(serverPinPattern)].map((match) => match.groups?.['version'] ?? ''),
  );

  const [version, ...others] = versions;

  if (version === undefined) {
    return { problem: 'names no ghcr.io/zgeoff/nixie image by tag and digest' };
  }

  if (others.length > 0) {
    return { problem: `pins more than one nixie release: ${[...versions].join(', ')}` };
  }

  return { version };
}
