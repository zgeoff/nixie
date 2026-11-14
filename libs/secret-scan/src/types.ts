// A clause of a rule's filter. A finding is discarded when any clause of its filter discards it.
export type FilterClause =
  | {
      // discards when every clause discards
      kind: 'all';
      clauses: readonly FilterClause[];
    }
  | {
      // discards when any clause discards
      kind: 'any';
      clauses: readonly FilterClause[];
    }
  | {
      // discards when the secret's entropy, in bits per character, is below the limit, or equal to
      // it when the clause is inclusive
      kind: 'entropy';
      limit: number;
      isInclusive: boolean;
    }
  | {
      // discards when any pattern matches the target; RE2 syntax
      kind: 'matches';
      target: 'secret' | 'match';
      patterns: readonly string[];
      isNegated: boolean;
    }
  | {
      // discards when the target holds any of the values
      kind: 'contains';
      target: 'secret' | 'match';
      values: readonly string[];
      isNegated: boolean;
    };

export interface Rule {
  id: string;

  // the rule runs on a text only when the text holds one of the keywords, in lower case
  keywords?: readonly string[];
  regex: string;
  secretGroup?: number;
  filter?: readonly FilterClause[];

  // rules that must also report somewhere in the same URL
  components?: readonly string[];

  // the rule only serves as another rule's component
  skipReport?: true;
}

export interface SecretMatch {
  rule: string;
}

export type SecretFinder = (url: string) => SecretMatch | null;
