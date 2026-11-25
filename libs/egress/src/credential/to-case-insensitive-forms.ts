import { buildLiteralPattern } from './build-literal-pattern';
import type { ValueForm } from './build-value-forms';

// The same forms, matched in any letter case, for a text that a transport lower-cases, such as a
// header name.
export function toCaseInsensitiveForms(forms: readonly ValueForm[]): readonly RegExp[] {
  return forms
    .filter((form) => form !== '')
    .map((form) => {
      const pattern = typeof form === 'string' ? buildLiteralPattern(form) : form;

      return new RegExp(pattern.source, `${pattern.flags.replace('i', '')}i`);
    });
}
