// The origin that the owner registers a client for: https, with no path, query, user name or
// password, and the same as the Origin header of the call that registers it. Null for any other.
export function pickRegisteredOrigin(
  origin: string,
  headerOrigin: string | undefined,
): string | null {
  const url = URL.parse(origin);

  if (url === null || url.protocol !== 'https:') {
    return null;
  }

  const hasExtra =
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== '';

  const isPlain = origin.replace(/\/$/u, '') === url.origin;

  if (hasExtra || !isPlain || url.origin !== headerOrigin) {
    return null;
  }

  return url.origin;
}
