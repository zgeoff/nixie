export interface ServedVersion {
  // the image of the pod's nixie container, and of the StatefulSet's template
  readonly podImage: string;
  readonly templateImage: string;
  readonly isReady: boolean;

  // The version the caller expects, such as the one a deploy just applied.
  readonly expected: string | undefined;
}

export type VersionPick =
  | { readonly kind: 'served'; readonly version: string }
  | { readonly kind: 'refused'; readonly message: string };

// A pod still on the old image after a rollout serves the old release, so the version check reads
// the pod's image and compares it with the template's.
export function pickVersionRefusal(served: ServedVersion): VersionPick {
  const version = parseImageVersion(served.podImage);

  if (version === null) {
    return {
      kind: 'refused',
      message: `nixie's pod runs ${served.podImage}, which names no version`,
    };
  }

  if (served.podImage !== served.templateImage) {
    return {
      kind: 'refused',
      message: `nixie's pod runs ${version}, and its StatefulSet asks for ${parseImageVersion(served.templateImage) ?? served.templateImage}: the rollout has not finished`,
    };
  }

  if (!served.isReady) {
    return { kind: 'refused', message: `nixie's pod runs ${version}, and is not ready` };
  }

  if (served.expected !== undefined && served.expected !== version) {
    return {
      kind: 'refused',
      message: `nixie's pod runs ${version}, and the deploy expects ${served.expected}`,
    };
  }

  return { kind: 'served', version };
}

// `ghcr.io/zgeoff/nixie:0.73.0@sha256:…` holds the version 0.73.0.
function parseImageVersion(image: string): string | null {
  const tagged = /:(?<version>\d+\.\d+\.\d+[^@]*)(?:@|$)/u.exec(
    image.slice(image.lastIndexOf('/')),
  );

  return tagged?.groups?.['version'] ?? null;
}
