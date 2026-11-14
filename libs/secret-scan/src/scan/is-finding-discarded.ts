import { match } from 'ts-pattern';
import type { FilterClause } from '../types';
import { compilePattern } from './compile-pattern';
import { measureEntropy } from './measure-entropy';

export interface Finding {
  secret: string;
  match: string;
}

export function isFindingDiscarded(clauses: readonly FilterClause[], finding: Finding): boolean {
  return clauses.some((clause) => isClauseDiscarding(clause, finding));
}

function isClauseDiscarding(clause: FilterClause, finding: Finding): boolean {
  return match(clause)
    .with({ kind: 'all' }, (all) => all.clauses.every((part) => isClauseDiscarding(part, finding)))
    .with({ kind: 'any' }, (any) => any.clauses.some((part) => isClauseDiscarding(part, finding)))
    .with({ kind: 'entropy' }, (entropy) => {
      const value = measureEntropy(finding.secret);

      return entropy.isInclusive ? value <= entropy.limit : value < entropy.limit;
    })
    .with({ kind: 'matches' }, (matches) => {
      const text = finding[matches.target];

      const isMatch = matches.patterns.some((pattern) =>
        compilePattern(pattern).matcher(text).find(),
      );

      return isMatch !== matches.isNegated;
    })
    .with({ kind: 'contains' }, (contains) => {
      const text = finding[contains.target];
      const isContained = contains.values.some((value) => text.includes(value));

      return isContained !== contains.isNegated;
    })
    .exhaustive();
}
