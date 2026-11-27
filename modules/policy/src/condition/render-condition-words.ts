import { match } from 'ts-pattern';
import type { CompareOp, ConditionView, Literal, Subject, TimePart } from './types';

// The view as one sentence, built on the host so every client shows the same words. A part with no
// phrase shows as code. The counts that CEL starts from 0 never show: the words name the month and
// the day.
export function renderConditionWords(view: ConditionView): string {
  return renderPart(view, false);
}

const textPhrases = {
  startsWith: 'starts with',
  endsWith: 'ends with',
  contains: 'contains',
} as const;

function renderPart(view: ConditionView, isNested: boolean): string {
  return match(view)
    .with({ kind: 'all' }, (all) =>
      wrap(all.parts.map((part) => renderPart(part, true)).join(', and '), isNested),
    )
    .with({ kind: 'any' }, (any) =>
      wrap(any.parts.map((part) => renderPart(part, true)).join(', or '), isNested),
    )
    .with({ kind: 'not' }, (not) => `it is not so that ${renderPart(not.part, true)}`)
    .with({ kind: 'compare' }, (compare) =>
      renderCompare(compare.subject, compare.op, compare.value),
    )
    .with(
      { kind: 'in' },
      (within) =>
        `${renderSubject(within.subject)} is one of ${within.values.map((value) => renderLiteral(value)).join(', ')}`,
    )
    .with(
      { kind: 'text' },
      (text) =>
        `${renderSubject(text.subject)} ${textPhrases[text.op]} ${renderLiteral(text.value)}`,
    )
    .with(
      { kind: 'size' },
      (size) =>
        `the size of ${renderSubject(size.subject)} ${renderOp(size.op, false)} ${size.value}`,
    )
    .with({ kind: 'present' }, (present) => `${renderSubject(present.subject)} is present`)
    .with(
      { kind: 'each' },
      (each) => `every item of ${renderSubject(each.list)}: ${renderPart(each.part, true)}`,
    )
    .with(
      { kind: 'some' },
      (some) => `some item of ${renderSubject(some.list)}: ${renderPart(some.part, true)}`,
    )
    .with({ kind: 'code' }, (code) => renderCode(code.source))
    .exhaustive();
}

function wrap(text: string, isNested: boolean): string {
  return isNested ? `(${text})` : text;
}

function renderCompare(subject: Subject, op: CompareOp, value: Literal): string {
  const isTime = subject.kind === 'time';
  const shown = isTime ? renderTimeValue(subject.part, value) : renderLiteral(value);

  return `${renderSubject(subject)} ${renderOp(op, isTime)} ${shown}`;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function renderTimeValue(part: TimePart, value: Literal): string {
  if (typeof value !== 'number') {
    return renderLiteral(value);
  }

  return match(part)
    .with('weekday', () => weekdays[value] ?? String(value))
    .with('month', () => months[value] ?? String(value))
    .otherwise(() => String(value));
}

function renderLiteral(value: Literal): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => renderLiteral(item)).join(', ')}]`;
  }

  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function renderSubject(subject: Subject): string {
  return match(subject)
    .with({ kind: 'variable' }, (variable) =>
      renderCode([variable.name, ...variable.path].join('.')),
    )
    .with({ kind: 'time' }, (time) => renderTime(time.part, time.zone))
    .with({ kind: 'item' }, () => 'the item')
    .with({ kind: 'code' }, (code) => renderCode(code.source))
    .exhaustive();
}

function renderCode(source: string): string {
  return `\`${source}\``;
}

function renderTime(part: TimePart, zone: string): string {
  return match(part)
    .with('hour', () => `the hour in ${zone}`)
    .with('minute', () => `the minute in ${zone}`)
    .with('weekday', () => `the day of the week in ${zone}`)
    .with('day', () => `the day of the month in ${zone}`)
    .with('month', () => `the month in ${zone}`)
    .with('year', () => `the year in ${zone}`)
    .exhaustive();
}

function renderOp(op: CompareOp, isTime: boolean): string {
  return match(op)
    .with('==', () => 'is')
    .with('!=', () => 'is not')
    .with('<', () => (isTime ? 'is before' : 'is less than'))
    .with('<=', () => (isTime ? 'is at or before' : 'is at most'))
    .with('>', () => (isTime ? 'is after' : 'is more than'))
    .with('>=', () => (isTime ? 'is at or after' : 'is at least'))
    .exhaustive();
}
