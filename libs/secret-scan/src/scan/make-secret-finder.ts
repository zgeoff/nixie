import { ownValueRule } from '../constants';
import type { SecretFinder } from '../types';
import { buildURLForms } from './build-url-forms';
import { findSecret } from './find-secret';

const escapePattern = /%[0-9a-f]{2}/giu;

// Makes a finder that reports `nixie-secret` for a URL that holds one of nixie's own secret values,
// and otherwise reports what findSecret reports. The value counts as held when it appears in the
// URL as given, in the URL decoded, or as its own percent-encoding, whatever the case of the hex.
export function makeSecretFinder(ownValues: readonly string[]): SecretFinder {
  const values = ownValues.filter((value) => value !== '');

  return (url) => {
    const [given = '', decoded = ''] = buildURLForms(url);
    const upperCased = given.replaceAll(escapePattern, (escape) => escape.toUpperCase());

    const isHolding = values.some(
      (value) =>
        given.includes(value) ||
        decoded.includes(value) ||
        upperCased.includes(encodeURIComponent(value)),
    );

    return isHolding ? { rule: ownValueRule } : findSecret(url);
  };
}
