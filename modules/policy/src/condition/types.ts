// The condition types of the policy module. The library's tree changes shape between major
// versions, so nothing outside the module reads it: callers read these types alone.

export type Literal = string | number | boolean | readonly Literal[];

export type TimePart = 'hour' | 'minute' | 'weekday' | 'day' | 'month' | 'year';

export type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

// args.to.address is name 'args' with path ['to', 'address']
export type Subject =
  | { readonly kind: 'variable'; readonly name: string; readonly path: readonly string[] }
  | { readonly kind: 'time'; readonly part: TimePart; readonly zone: string }

  // the element inside each or some
  | { readonly kind: 'item' }
  | { readonly kind: 'code'; readonly source: string };

// && and ||, flattened
export type ConditionView =
  | { readonly kind: 'all' | 'any'; readonly parts: readonly ConditionView[] }
  | { readonly kind: 'not'; readonly part: ConditionView }
  | {
      readonly kind: 'compare';
      readonly subject: Subject;
      readonly op: CompareOp;
      readonly value: Literal;
    }
  | { readonly kind: 'in'; readonly subject: Subject; readonly values: readonly Literal[] }
  | {
      readonly kind: 'text';
      readonly subject: Subject;
      readonly op: 'startsWith' | 'endsWith' | 'contains';
      readonly value: string;
    }
  | {
      readonly kind: 'size';
      readonly subject: Subject;
      readonly op: CompareOp;
      readonly value: number;
    }
  | { readonly kind: 'present'; readonly subject: Subject }

  // all and exists
  | {
      readonly kind: 'each' | 'some';
      readonly list: Subject;
      readonly part: ConditionView;
    }

  // any part with no phrase, shown as code
  | { readonly kind: 'code'; readonly source: string };

export type ConditionFault =
  | 'condition_syntax'
  | 'condition_too_large'
  | 'condition_not_allowed'
  | 'condition_type'
  | 'condition_note_missing';

export type ConditionCheck =
  | { readonly ok: true; readonly view: ConditionView }

  // detail: the construct or the type error
  | { readonly ok: false; readonly fault: ConditionFault; readonly detail: string };

export type ConditionResult =
  | { readonly kind: 'true' }
  | { readonly kind: 'false' }

  // code: the library's error code, or nixie's own, input_too_large or condition_invalid
  | { readonly kind: 'error'; readonly code: string; readonly missing?: string };

// The condition and note of a rule, which the check reads
export interface ConditionSource {
  readonly cel: string;
  readonly note?: string | undefined;
}
