// A Google API host also serves an older token endpoint under /oauth2/, so that path is refused on
// any host. The path is decoded and lowered first, so an escaped letter never hides the segment.
export function isRefusedOAuthURL(url: URL, oauthHostnames: readonly string[]): boolean {
  if (oauthHostnames.includes(url.hostname.toLowerCase())) {
    return true;
  }

  const path = toDecodedPath(url.pathname).replaceAll(/\/+/gu, '/');

  return path === '/oauth2' || path.startsWith('/oauth2/');
}

function toDecodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}
