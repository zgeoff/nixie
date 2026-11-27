import type { ReactNode } from 'react';
import { RuleCondition } from '../rule/rule-condition';
import { RuleSentence } from '../rule/rule-sentence';
import { css } from '../styled-system/css';
import type { ApprovalRead } from '../types';

const meta = css({ fontSize: 'sm', opacity: '0.8' });
const fieldList = css({ fontSize: 'sm', display: 'grid', gap: '1' });

export interface ApprovalBoundsProps {
  readonly body: NonNullable<ApprovalRead['body']>;
}

export function ApprovalBounds(props: ApprovalBoundsProps): ReactNode {
  const fields = Object.entries(props.body.fields);
  const conditions = props.body.ruleConditions ?? [];

  // a condition shows under the field of its own rule, and a rule with no field of its own shows
  // its condition after the fields
  const placed = new Set(fields.flatMap(([name]) => toRuleNumber(name) ?? []));

  const unplaced = conditions.filter((condition) => !placed.has(condition.rule + 1));

  return (
    <>
      {fields.length === 0 ? null : (
        <dl className={fieldList}>
          {fields.map(([name, value]) => (
            <div key={name}>
              <dt className={css({ fontWeight: 'semibold' })}>{name}</dt>
              <dd className={css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })}>
                {renderFieldValue(name, value)}
              </dd>
              {conditions
                .filter((condition) => condition.rule + 1 === toRuleNumber(name))
                .map((condition) => (
                  <dd key={condition.rule}>
                    <RuleCondition condition={condition} />
                  </dd>
                ))}
            </div>
          ))}
        </dl>
      )}
      {props.body.ruleSentence === null ? null : (
        <p className={meta}>
          Always allow adds this rule: <RuleSentence sentence={props.body.ruleSentence} />
        </p>
      )}
      {unplaced.map((condition) => (
        <RuleCondition condition={condition} key={condition.rule} />
      ))}
      {props.body.conditionErrors === undefined ||
      props.body.conditionErrors.length === 0 ? null : (
        <ul aria-label="Conditions that failed" className={meta}>
          {props.body.conditionErrors.map((error) => (
            <li key={error.ruleID}>
              The condition of the rule <code>{error.ruleID}</code> failed with the error{' '}
              <code>{error.code}</code>.
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// A mandate names each of its rules in a field `rule 1`, `rule 2` and on, as a rule sentence.
const ruleFieldPattern = /^rule (?<number>\d+)$/u;

function toRuleNumber(fieldName: string): number | null {
  const number = ruleFieldPattern.exec(fieldName)?.groups?.['number'];

  return number === undefined ? null : Number(number);
}

// A field that lists one entry per line, such as the items of a move, stays folded under its count
// until the user opens it.
const foldedLineFields = new Set(['items']);

function renderFieldValue(name: string, value: string): ReactNode {
  if (foldedLineFields.has(name)) {
    const lines = value.split('\n');

    return (
      <details>
        <summary>{`${String(lines.length)} ${lines.length === 1 ? 'item' : 'items'}`}</summary>
        <ul className={css({ listStyle: 'none', paddingInlineStart: '0' })}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    );
  }

  return ruleFieldPattern.test(name) ? <RuleSentence sentence={value} /> : value;
}
