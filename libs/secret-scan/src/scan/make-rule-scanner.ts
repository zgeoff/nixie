import type { RE2JS } from 're2js';
import type { FilterClause, Rule, SecretMatch } from '../types';
import { compilePattern } from './compile-pattern';
import { isFindingDiscarded } from './is-finding-discarded';

export type RuleScanner = (forms: readonly string[]) => SecretMatch | null;

// Makes a scanner that tries each rule, in order, on each of the given texts. A rule reports when
// one text holds a match that no filter discards, and every companion rule it needs also has such
// a match somewhere in the texts. A rule marked skipReport serves only as a companion.
export function makeRuleScanner(
  rules: readonly Rule[],
  topLevelFilter: readonly FilterClause[],
): RuleScanner {
  const rulesByID = new Map(rules.map((rule) => [rule.id, rule]));

  return (forms) => {
    const lowered = forms.map((form) => form.toLowerCase());

    const outcomes = new Map<string, boolean>();

    const hasFinding = (rule: Rule): boolean => {
      const known = outcomes.get(rule.id);

      if (known !== undefined) {
        return known;
      }

      // a companion cycle ends here as a miss
      outcomes.set(rule.id, false);

      const outcome =
        hasMatchInAnyForm(rule, forms, lowered, topLevelFilter) &&
        (rule.components ?? []).every((id) => {
          const companion = rulesByID.get(id);

          return companion !== undefined && hasFinding(companion);
        });

      outcomes.set(rule.id, outcome);

      return outcome;
    };

    for (const rule of rules) {
      if (rule.skipReport !== true && hasFinding(rule)) {
        return { rule: rule.id };
      }
    }

    return null;
  };
}

function hasMatchInAnyForm(
  rule: Rule,
  forms: readonly string[],
  lowered: readonly string[],
  topLevelFilter: readonly FilterClause[],
): boolean {
  const pattern = compilePattern(rule.regex);

  return forms.some((form, index) => {
    const text = lowered[index] ?? '';

    const hasKeyword =
      rule.keywords === undefined ||
      rule.keywords.length === 0 ||
      rule.keywords.some((keyword) => text.includes(keyword));

    return hasKeyword && hasKeptMatch(pattern, form, rule, topLevelFilter);
  });
}

function hasKeptMatch(
  pattern: RE2JS,
  text: string,
  rule: Rule,
  topLevelFilter: readonly FilterClause[],
): boolean {
  const matcher = pattern.matcher(text);

  while (matcher.find()) {
    const whole = matcher.group(0) ?? '';
    const finding = { match: whole, secret: pickSecret(matcher, rule, whole) };

    if (
      !isFindingDiscarded(topLevelFilter, finding) &&
      !isFindingDiscarded(rule.filter ?? [], finding)
    ) {
      return true;
    }
  }

  return false;
}

interface GroupReader {
  group: (group: number) => string | null;
  groupCount: () => number;
}

// The secret is the rule's secret group, else the first capture group that holds text, else the
// whole match.
function pickSecret(matcher: GroupReader, rule: Rule, whole: string): string {
  if (rule.secretGroup !== undefined) {
    return matcher.group(rule.secretGroup) ?? whole;
  }

  for (let index = 1; index <= matcher.groupCount(); index += 1) {
    const captured = matcher.group(index);

    if (captured !== null && captured !== '') {
      return captured;
    }
  }

  return whole;
}
