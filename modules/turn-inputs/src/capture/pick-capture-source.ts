import type { TurnInputSource } from '../turn-input-log-config-schema';

export interface PickedSource {
  readonly name: string;
  readonly source: TurnInputSource;
}

// A source matches only when the scheme, host and port are equal and its path, closed with a slash,
// is a prefix of the profile's path closed with a slash. A string prefix alone would let
// https://gw.example match https://gw.example.evil.test.
export function pickCaptureSource(
  sources: Readonly<Record<string, TurnInputSource>>,
  profileURL: string,
): PickedSource | null {
  const profile = URL.parse(profileURL);

  if (profile === null) {
    return null;
  }

  for (const [name, source] of Object.entries(sources)) {
    const base = URL.parse(source.baseURL);

    if (
      base !== null &&
      base.protocol === profile.protocol &&
      base.host === profile.host &&
      toClosedPath(profile.pathname).startsWith(toClosedPath(base.pathname))
    ) {
      return { name, source };
    }
  }

  return null;
}

function toClosedPath(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}
