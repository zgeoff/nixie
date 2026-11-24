// The header a fetcher refuses a caller to set: the ones that carry an identity of their own, and
// the credential's header. A name compares without regard to case.
export function findRefusedHeader(
  names: Iterable<string>,
  credentialHeader: string | null,
): string | null {
  const refused = new Set(['authorization', 'proxy-authorization', 'cookie']);

  if (credentialHeader !== null) {
    refused.add(credentialHeader.toLowerCase());
  }

  for (const name of names) {
    if (refused.has(name.toLowerCase())) {
      return name;
    }
  }

  return null;
}
