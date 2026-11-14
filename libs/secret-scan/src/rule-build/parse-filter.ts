import invariant from 'tiny-invariant';
import type { FilterClause } from '../types';
import { isWrappedInParens } from './is-wrapped-in-parens';
import { splitTopLevel } from './split-top-level';

export interface ParsedFilter {
  clauses: FilterClause[];

  // short forms of the clauses the scan cannot evaluate, which therefore never discard a finding
  dropped: string[];
}

const bindingPattern = /^let\s+(?<name>[A-Za-z_]\w*)\s*=(?<body>[\s\S]*)$/u;

// Turns the filter script of one rule into the clauses the scan evaluates. A clause that reads only
// the secret or the match is kept. A clause that needs more is dropped, which never discards a
// finding. A clause of any other shape throws, so a new upstream form never passes unnoticed.
export function parseFilter(ruleID: string, source: string): ParsedFilter {
  const statements = splitTopLevel(source, ';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');

  const finalExpression = statements.pop();

  if (finalExpression === undefined) {
    return { clauses: [], dropped: [] };
  }

  const bindings = new Map<string, string>();

  for (const statement of statements) {
    const binding = bindingPattern.exec(statement)?.groups;

    if (binding?.['name'] === undefined || binding['body'] === undefined) {
      throw new Error(`rule ${ruleID}: cannot read the filter statement: ${shorten(statement)}`);
    }

    bindings.set(binding['name'], binding['body'].trim());
  }

  return parseExpression(finalExpression, { ruleID, bindings, reading: new Set() });
}

function shorten(text: string): string {
  const collapsed = text.replaceAll(/\s+/gu, ' ').trim();

  return collapsed.length > 80 ? `${collapsed.slice(0, 77)}...` : collapsed;
}

interface ParseContext {
  ruleID: string;
  bindings: ReadonlyMap<string, string>;

  // the names of the bindings being read, so a self-referencing binding stops
  reading: ReadonlySet<string>;
}

const identifierPattern = /^[A-Za-z_]\w*$/u;

function parseExpression(text: string, ctx: ParseContext): ParsedFilter {
  const trimmed = text.trim();
  const disjuncts = splitTopLevel(trimmed, '||');

  if (disjuncts.length > 1) {
    return mergeParsed(disjuncts.map((disjunct) => parseExpression(disjunct, ctx)));
  }

  if (trimmed === '') {
    return { clauses: [], dropped: [] };
  }

  if (isWrappedInParens(trimmed)) {
    return parseExpression(trimmed.slice(1, -1), ctx);
  }

  const conjuncts = splitTopLevel(trimmed, '&&');

  if (conjuncts.length > 1) {
    return parseConjunction(trimmed, conjuncts, ctx);
  }

  if (identifierPattern.test(trimmed)) {
    return parseBinding(trimmed, ctx);
  }

  return parseClause(trimmed, ctx);
}

function mergeParsed(parts: readonly ParsedFilter[]): ParsedFilter {
  return {
    clauses: parts.flatMap((part) => part.clauses),
    dropped: parts.flatMap((part) => part.dropped),
  };
}

// A conjunction discards only when every part holds, so a part that the scan cannot evaluate
// drops the whole conjunction.
function parseConjunction(
  conjunction: string,
  conjuncts: readonly string[],
  ctx: ParseContext,
): ParsedFilter {
  const parts = conjuncts.map((conjunct) => parseExpression(conjunct, ctx));

  if (parts.some((part) => part.dropped.length > 0)) {
    return { clauses: [], dropped: [shorten(conjunction)] };
  }

  return {
    clauses: [{ kind: 'all', clauses: parts.map((part) => toSingleClause(part)) }],
    dropped: [],
  };
}

function toSingleClause(part: ParsedFilter): FilterClause {
  const [first, ...rest] = part.clauses;

  invariant(first !== undefined, 'a recognised part holds a clause');

  return rest.length === 0 ? first : { kind: 'any', clauses: part.clauses };
}

function parseBinding(name: string, ctx: ParseContext): ParsedFilter {
  const bound = ctx.bindings.get(name);

  if (bound === undefined || ctx.reading.has(name)) {
    throw new Error(`rule ${ctx.ruleID}: cannot classify the filter name: ${name}`);
  }

  return parseExpression(bound, { ...ctx, reading: new Set([...ctx.reading, name]) });
}

const callPattern =
  /^(?<negation>!?)\s*(?:filter\.)?(?<name>entropy|matchesAny|containsAny)\((?<args>[\s\S]*)\)\s*(?:(?<bound><=|<)\s*(?<limit>\d+(?:\.\d+)?))?$/u;

function parseClause(text: string, ctx: ParseContext): ParsedFilter {
  const call = callPattern.exec(text)?.groups;

  if (call?.['name'] !== undefined && call['args'] !== undefined) {
    const clause = parseCall(
      {
        isNegated: call['negation'] === '!',
        name: call['name'],
        args: call['args'],
        bound: call['bound'],
        limit: call['limit'],
      },
      ctx,
    );

    if (clause !== null) {
      return { clauses: [clause], dropped: [] };
    }
  }

  if (hasUnscannableRead(text, ctx)) {
    return { clauses: [], dropped: [shorten(text)] };
  }

  throw new Error(`rule ${ctx.ruleID}: cannot classify the filter clause: ${shorten(text)}`);
}

interface CallParts {
  isNegated: boolean;
  name: string;
  args: string;
  bound: string | undefined;
  limit: string | undefined;
}

function parseCall(call: CallParts, ctx: ParseContext): FilterClause | null {
  const args = splitTopLevel(call['args'], ',').map((arg) => arg.trim());
  const target = pickTarget(args[0]);

  if (target === null) {
    return null;
  }

  if (call['name'] === 'entropy') {
    if (args.length !== 1 || call.isNegated || call['limit'] === undefined) {
      return null;
    }

    return { kind: 'entropy', limit: Number(call['limit']), isInclusive: call['bound'] === '<=' };
  }

  const [, list] = args;

  if (args.length !== 2 || list === undefined || call['limit'] !== undefined) {
    return null;
  }

  if (!list.startsWith('[') || !list.endsWith(']')) {
    return null;
  }

  const items = splitTopLevel(list.slice(1, -1), ',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) => parseStringLiteral(item, ctx));

  if (call['name'] === 'matchesAny') {
    return { kind: 'matches', target, patterns: items, isNegated: call.isNegated };
  }

  return { kind: 'contains', target, values: items, isNegated: call.isNegated };
}

function pickTarget(arg: string | undefined): 'secret' | 'match' | null {
  if (arg === 'finding["secret"]') {
    return 'secret';
  }

  if (arg === 'finding["match"]') {
    return 'match';
  }

  return null;
}

function parseStringLiteral(literal: string, ctx: ParseContext): string {
  if (literal.startsWith('`') && literal.endsWith('`') && literal.length >= 2) {
    return literal.slice(1, -1);
  }

  if (literal.startsWith('"') && literal.endsWith('"')) {
    try {
      const value: unknown = JSON.parse(literal);

      if (typeof value === 'string') {
        return value;
      }
    } catch {
      // falls through to the error below
    }
  }

  throw new Error(`rule ${ctx.ruleID}: cannot read the string in a filter: ${shorten(literal)}`);
}

// reads that need more than the secret and the match: a tokenizer, the file path, the text around
// the match, or a length
const droppedPattern =
  /tokenRatio\(|failsTokenEfficiency\(|attributes\[|\blen\(|finding\["(?:line|fragment_raw|captures|\w*idx)"\]/u;

// True when the text reads, directly or through a name bound earlier, a value that only the
// whole file holds.
function hasUnscannableRead(text: string, ctx: ParseContext): boolean {
  if (droppedPattern.test(text)) {
    return true;
  }

  const code = text.replaceAll(/`[^`]*`|"(?:[^"\\]|\\.)*"/gu, '');
  const names = code.match(/[A-Za-z_]\w*/gu) ?? [];

  return names.some((name) => {
    const bound = ctx.bindings.get(name);

    return (
      bound !== undefined &&
      !ctx.reading.has(name) &&
      hasUnscannableRead(bound, { ...ctx, reading: new Set([...ctx.reading, name]) })
    );
  });
}
