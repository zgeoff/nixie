import { publicFilter, publicRules } from '../generated/public-rules.generated';
import type { SecretMatch } from '../types';
import { buildURLForms } from './build-url-forms';
import { makeRuleScanner } from './make-rule-scanner';
import type { RuleScanner } from './make-rule-scanner';

let publicScanner: RuleScanner | null = null;

// Finds the first public rule that a key or token in the URL matches. The URL carries a key in its
// path or its query, as given or percent-encoded.
export function findSecret(url: string): SecretMatch | null {
  publicScanner ??= makeRuleScanner(publicRules, publicFilter);

  return publicScanner(buildURLForms(url));
}
