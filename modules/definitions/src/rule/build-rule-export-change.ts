import type { RuleForm } from '@heynixie/policy';
import { renderRule } from '@heynixie/policy';
import { match } from 'ts-pattern';
import type { DefinitionsChange, RuntimeRule } from '../types';

export const ruleExportBranch = 'nixie/rules';

export interface RuleExportInput {
  readonly changes: readonly RuntimeRule[];
  readonly files: ReadonlyMap<string, string>;
}

const newRulesPath = 'rules/nixie.yaml';

// The export edits the user's YAML in place, rule by rule, so the comments and the order of every
// rule it leaves alone stay as the user wrote them.
export function buildRuleExportChange(input: RuleExportInput): DefinitionsChange {
  const files = new Map<string, string | null>();

  for (const change of input.changes) {
    const path = findRulePath(input.files, files, change.ruleID);
    const block = change.rule === null ? null : renderRuleBlock(change.rule.rule);

    if (path === null) {
      if (block !== null) {
        const text = pickCurrentText(input.files, files, newRulesPath);

        files.set(newRulesPath, appendBlock(text, block));
      }

      continue;
    }

    const text = pickCurrentText(input.files, files, path);
    const edited = replaceBlock(text, change.ruleID, block);
    const kept = edited.trim() === '' ? null : `${edited.trimEnd()}\n`;

    files.set(path, kept);
  }

  const title = 'Update the rules nixie changed';

  return {
    branch: ruleExportBranch,
    title,
    message: title,
    body: renderBody(input.changes),
    files,
  };
}

function findRulePath(
  base: ReadonlyMap<string, string>,
  edited: ReadonlyMap<string, string | null>,
  ruleID: string,
): string | null {
  for (const [path, text] of base) {
    const current = edited.has(path) ? edited.get(path) : text;

    if (current !== null && current !== undefined && findBlock(current, ruleID) !== null) {
      return path;
    }
  }

  return null;
}

interface BlockRange {
  readonly start: number;
  readonly end: number;
}

const topLevelKeyPattern = /^(?<quote>["']?)(?<key>[a-z0-9]+(?:-[a-z0-9]+)*)\k<quote>[ \t]*:/u;

// A blank line or a comment at column 0 can sit inside a block, so the block runs to the next line
// of content at column 0, less the blank lines and comments just above it, which head the next rule.
function findBlock(text: string, ruleID: string): BlockRange | null {
  const lines = text.split('\n');

  const start = lines.findIndex(
    (line) => topLevelKeyPattern.exec(line)?.groups?.['key'] === ruleID,
  );

  if (start === -1) {
    return null;
  }

  let end = start + 1;

  while (end < lines.length && !isTopLevelLine(lines[end] ?? '')) {
    end += 1;
  }

  while (end > start + 1 && isGapLine(lines[end - 1] ?? '')) {
    end -= 1;
  }

  return { start, end };
}

function isTopLevelLine(line: string): boolean {
  return /^\S/u.test(line) && !line.startsWith('#');
}

function isGapLine(line: string): boolean {
  return line.trim() === '' || line.startsWith('#');
}

// The definitions repo formats its YAML with oxfmt, so the block is written the way oxfmt leaves
// it: strings double-quoted, a flow list only while its line fits, and every mapping or list of
// mappings in block style.
function renderRuleBlock(rule: RuleForm): string {
  const fields = Object.keys(rule)
    .filter((field) => field !== 'id')
    .toSorted((left, right) => toFieldRank(left) - toFieldRank(right));

  const lines = fields.flatMap((field) => renderEntry(field, rule[field], 1));

  return [`${rule.id}:`, ...lines].join('\n');
}

const ruleFieldOrder = [
  'outcome',
  'tools',
  'effects',
  'contexts',
  'definitions',
  'checks',
  'destinations',
  'sources',
  'expires',
  'mandate',
  'lift',
  'cel',
  'note',
];

function toFieldRank(field: string): number {
  const rank = ruleFieldOrder.indexOf(field);

  return rank === -1 ? ruleFieldOrder.length : rank;
}

const maxLineWidth = 100;

function renderEntry(key: string, value: unknown, depth: number): string[] {
  const indent = '  '.repeat(depth);

  if (Array.isArray(value)) {
    const flow = `${indent}${key}: [${value.map((item) => JSON.stringify(item)).join(', ')}]`;

    if (value.every((item) => isScalar(item)) && flow.length <= maxLineWidth) {
      return [flow];
    }

    return [`${indent}${key}:`, ...value.flatMap((item) => renderItem(item, depth + 1))];
  }

  if (isRecord(value) && Object.keys(value).length > 0) {
    return [
      `${indent}${key}:`,
      ...Object.entries(value).flatMap(([name, entry]) => renderEntry(name, entry, depth + 1)),
    ];
  }

  return [`${indent}${key}: ${isRecord(value) ? '{}' : JSON.stringify(value)}`];
}

function isScalar(value: unknown): boolean {
  return typeof value !== 'object' || value === null;
}

function renderItem(item: unknown, depth: number): string[] {
  const indent = '  '.repeat(depth);

  if (isRecord(item) && Object.keys(item).length > 0) {
    const [first = '', ...rest] = Object.entries(item).flatMap(([name, entry]) =>
      renderEntry(name, entry, depth + 1),
    );

    return [`${indent}- ${first.trimStart()}`, ...rest];
  }

  return [`${indent}- ${isRecord(item) ? '{}' : JSON.stringify(item)}`];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickCurrentText(
  base: ReadonlyMap<string, string>,
  edited: ReadonlyMap<string, string | null>,
  path: string,
): string {
  if (edited.has(path)) {
    return edited.get(path) ?? '';
  }

  return base.get(path) ?? '';
}

function appendBlock(text: string, block: string): string {
  const trimmed = text.trimEnd();

  return trimmed === '' ? `${block}\n` : `${trimmed}\n${block}\n`;
}

function replaceBlock(text: string, ruleID: string, block: string | null): string {
  const range = findBlock(text, ruleID);

  if (range === null) {
    return text;
  }

  const lines = text.split('\n');
  const replacement = block === null ? [] : block.split('\n');

  return [...lines.slice(0, range.start), ...replacement, ...lines.slice(range.end)].join('\n');
}

function renderBody(changes: readonly RuntimeRule[]): string {
  const lines = changes.map((change) => {
    const sentence = change.rule === null ? 'Remove this rule.' : renderRule(change.rule.rule);

    const changer = match(change.changedBy)
      .with('owner', () => 'you')
      .with('nixie', () => 'nixie')
      .exhaustive();

    return `- \`${change.ruleID}\`: ${sentence} Changed by ${changer}: ${change.reason}`;
  });

  return [
    'nixie changed these rules while it ran. Each change is already in force, and merging this pull request makes your definitions hold it.',
    '',
    ...lines,
  ].join('\n');
}
