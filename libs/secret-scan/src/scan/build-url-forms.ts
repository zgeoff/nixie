import { decodePercentEncoding } from './decode-percent-encoding';

const separatorPattern = /[&?#/]/gu;

// The texts a rule is tried on: the URL as given, the URL decoded, and the URL split into lines at
// `&`, `?`, `#` and `/` and then decoded. Splitting first keeps an encoded `%2F` or `%26` inside
// one value.
export function buildURLForms(url: string): string[] {
  const lines = url.replaceAll(separatorPattern, '\n');

  return [url, decodePercentEncoding(url), decodePercentEncoding(lines)];
}
