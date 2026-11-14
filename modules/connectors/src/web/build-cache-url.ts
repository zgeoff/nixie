// The form of a URL under which the page cache stores and finds it: the URL as the parser prints
// it, with no fragment. Null for a URL the parser rejects, which never hits.
export function buildCacheURL(url: string): string | null {
  if (!URL.canParse(url)) {
    return null;
  }

  const parsed = new URL(url);

  parsed.hash = '';

  return parsed.href;
}
