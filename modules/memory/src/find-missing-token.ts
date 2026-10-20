import type { DestinationToken } from './collect-destination-tokens';
import { collectDestinationTokens } from './collect-destination-tokens';

// Finds the first destination-like token in the memory text that the quote lacks, or null. Each
// number compares with each quoted number alone or the account part of a quoted BSB, so digits from
// 2 numbers never join, and a bare domain compares with each host in the quote.
export function findMissingToken(text: string, quote: string): DestinationToken | null {
  const quoted = collectDestinationTokens(quote);

  const keys = new Set(quoted.map((token) => `${token.kind}:${token.key}`));

  const numbers = new Set(
    quoted
      .filter((token) => isNumberKind(token))
      .flatMap((token) => (token.part === undefined ? [token.key] : [token.key, token.part])),
  );

  const hosts = new Set(quoted.map((token) => getHost(token)));

  return (
    collectDestinationTokens(text).find(
      (token) =>
        !keys.has(`${token.kind}:${token.key}`) &&
        !(isNumberKind(token) && numbers.has(token.key)) &&
        !(token.kind === 'domain' && hosts.has(token.key)),
    ) ?? null
  );
}

function isNumberKind(token: DestinationToken): boolean {
  return token.kind === 'phone' || token.kind === 'account';
}

function getHost(token: DestinationToken): string {
  if (token.kind === 'email') {
    return token.key.slice(token.key.indexOf('@') + 1);
  }

  if (token.kind === 'url') {
    return token.key.replace(/^https?:\/\//u, '').split(/[/?#]/u)[0] ?? '';
  }

  return token.key;
}
