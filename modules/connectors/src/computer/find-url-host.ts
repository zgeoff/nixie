// The host of a web address, or null for a page that is no web page, such as about:blank.
export function findURLHost(url: string): string | null {
  const parsed = URL.parse(url);

  return parsed !== null && /^https?:$/u.test(parsed.protocol) ? parsed.host : null;
}
