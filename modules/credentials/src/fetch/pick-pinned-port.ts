export function pickPinnedPort(url: URL): number {
  if (url.port !== '') {
    return Number(url.port);
  }

  return url.protocol === 'https:' ? 443 : 80;
}
